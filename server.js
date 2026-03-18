const fs = require('fs');
const path = require('path');
const net = require('net');
const crypto = require('crypto');
const express = require('express');
const session = require('express-session');
const multer = require('multer');
const SQLiteStoreFactory = require('connect-sqlite3');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const { parseCharacterCardImportFile } = require('./character-card-import.cjs');

const app = express();
const SQLiteStore = SQLiteStoreFactory(session);

const ROOT_DIR = __dirname;
const DATA_DIR = path.join(ROOT_DIR, 'data');
const MEDIA_DIR = path.join(DATA_DIR, 'media');
const DB_PATH = path.join(DATA_DIR, 'erochat.sqlite');
const PORT = Number(process.env.PORT || 20121);
const SESSION_SECRET = process.env.SESSION_SECRET || 'change-this-secret';
const COOKIE_SECURE = process.env.COOKIE_SECURE === 'true';
const GROK_API_KEY_FILE = process.env.GROK_API_KEY_FILE || path.join(ROOT_DIR, 'grok.key');

const MAX_JSON_BODY_BYTES = '25mb';
const MAX_INLINE_MEDIA_BYTES = 10 * 1024 * 1024;
const MAX_UPLOADED_MEDIA_BYTES = 80 * 1024 * 1024;
const MAX_REMOTE_MEDIA_BYTES = 80 * 1024 * 1024;
const MAX_GROK_TTS_TEXT_LENGTH = 15000;
const PREMIUM_GROK_CHAT_MODEL = 'grok-4-1-fast-reasoning';
const DEFAULT_GROK_TTS_VOICE_ID = 'ara';
const DEFAULT_GROK_TTS_LANGUAGE = 'auto';
const DEFAULT_GROK_TTS_OUTPUT_FORMAT = Object.freeze({
    codec: 'mp3',
    sample_rate: 24000,
    bit_rate: 128000
});
const DEFAULT_ADMIN_USERNAME = 'admin';
const DEFAULT_ADMIN_PASSWORD = 'admin';

const LOGIN_RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_RATE_LIMIT_MAX_ATTEMPTS = 20;
const GENERATOR_ALLOWED_MODES = new Set(['image_generate', 'image_edit', 'video_generate']);
const GENERATOR_ALLOWED_PROVIDERS = new Set(['grok', 'swarm', 'comfy']);
const GENERATOR_ALLOWED_STATUSES = new Set([
    'queued',
    'running',
    'polling',
    'succeeded',
    'failed',
    'interrupted'
]);
const loginAttempts = new Map();

const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: MAX_UPLOADED_MEDIA_BYTES,
        files: 1
    }
});

if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}
if (!fs.existsSync(MEDIA_DIR)) {
    fs.mkdirSync(MEDIA_DIR, { recursive: true });
}

const db = new sqlite3.Database(DB_PATH);

function readSecretFromFile(filePath) {
    try {
        return fs.readFileSync(filePath, 'utf8').trim();
    } catch {
        return '';
    }
}

const GROK_API_KEY = (
    process.env.GROK_API_KEY ||
    readSecretFromFile(GROK_API_KEY_FILE) ||
    ''
).trim();

function getIntEnv(name, fallback) {
    const raw = process.env[name];
    if (raw == null || raw === '') return fallback;
    const parsed = Number.parseInt(raw, 10);
    return Number.isFinite(parsed) ? parsed : fallback;
}

const DEFAULT_USER_CREDITS = getIntEnv('DEFAULT_USER_CREDITS', 100);
const CREDIT_COST_GROK_CHAT = getIntEnv('CREDIT_COST_GROK_CHAT', 1);
const CREDIT_COST_GROK_IMAGE = getIntEnv('CREDIT_COST_GROK_IMAGE', 2);
const CREDIT_COST_GROK_VIDEO = getIntEnv('CREDIT_COST_GROK_VIDEO', 3);
const CREDIT_COST_GROK_TTS = getIntEnv('CREDIT_COST_GROK_TTS', 1);

function run(query, params = []) {
    return new Promise((resolve, reject) => {
        db.run(query, params, function onRun(err) {
            if (err) {
                reject(err);
                return;
            }
            resolve(this);
        });
    });
}

function get(query, params = []) {
    return new Promise((resolve, reject) => {
        db.get(query, params, (err, row) => {
            if (err) {
                reject(err);
                return;
            }
            resolve(row);
        });
    });
}

function all(query, params = []) {
    return new Promise((resolve, reject) => {
        db.all(query, params, (err, rows) => {
            if (err) {
                reject(err);
                return;
            }
            resolve(rows || []);
        });
    });
}

function jsonOrNull(text) {
    if (!text) return null;
    try {
        return JSON.parse(text);
    } catch {
        return null;
    }
}

function parseJsonArray(value) {
    if (Array.isArray(value)) {
        return value;
    }
    if (typeof value !== 'string' || !value.trim()) {
        return [];
    }
    const parsed = jsonOrNull(value);
    return Array.isArray(parsed) ? parsed : [];
}

function parseJsonObject(value) {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
        return value;
    }
    if (typeof value !== 'string' || !value.trim()) {
        return {};
    }
    const parsed = jsonOrNull(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
}

function stringifyJson(value, fallback) {
    return JSON.stringify(value ?? fallback);
}

function getCreditCosts() {
    return {
        chat: CREDIT_COST_GROK_CHAT,
        image: CREDIT_COST_GROK_IMAGE,
        video: CREDIT_COST_GROK_VIDEO,
        tts: CREDIT_COST_GROK_TTS
    };
}

function normalizeMimeType(mimeType) {
    return String(mimeType || '')
        .split(';')[0]
        .trim()
        .toLowerCase();
}

function parseBase64DataUrl(dataUrl) {
    if (typeof dataUrl !== 'string') return null;
    const match = dataUrl.match(/^data:([^;,]+);base64,([A-Za-z0-9+/=\r\n]+)$/);
    if (!match) return null;

    const mimeType = normalizeMimeType(match[1]);
    const base64 = String(match[2] || '').replace(/\s+/g, '');
    if (!mimeType || !base64) return null;

    try {
        const buffer = Buffer.from(base64, 'base64');
        if (!buffer || buffer.length === 0) return null;
        return { mimeType, buffer };
    } catch {
        return null;
    }
}

function mediaExtensionForMimeType(mimeType) {
    switch (normalizeMimeType(mimeType)) {
        case 'image/png':
            return 'png';
        case 'image/jpeg':
        case 'image/jpg':
            return 'jpg';
        case 'image/webp':
            return 'webp';
        case 'image/gif':
            return 'gif';
        case 'video/mp4':
            return 'mp4';
        case 'video/webm':
            return 'webm';
        case 'video/quicktime':
            return 'mov';
        default:
            return null;
    }
}

function mediaTypeForMimeType(mimeType) {
    const normalized = normalizeMimeType(mimeType);
    if (normalized.startsWith('image/')) return 'image';
    if (normalized.startsWith('video/')) return 'video';
    return null;
}

function generateMediaFileId() {
    if (typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID();
    }
    return crypto.randomBytes(16).toString('hex');
}

function buildMediaUrl(fileName) {
    return `/app/media/${encodeURIComponent(fileName)}`;
}

async function storeMediaBuffer(buffer, mimeType, maxBytes = MAX_UPLOADED_MEDIA_BYTES) {
    if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
        throw new Error('Media content was empty.');
    }

    if (buffer.length > maxBytes) {
        throw new Error('Media file is too large to store.');
    }

    const normalizedMimeType = normalizeMimeType(mimeType);
    const mediaType = mediaTypeForMimeType(normalizedMimeType);
    const ext = mediaExtensionForMimeType(normalizedMimeType);
    if (!mediaType || !ext) {
        throw new Error('Only png, jpg, webp, gif, mp4, webm, or mov files are supported.');
    }

    const fileName = `${Date.now()}-${generateMediaFileId()}.${ext}`;
    const filePath = path.join(MEDIA_DIR, fileName);
    await fs.promises.writeFile(filePath, buffer);

    return {
        url: buildMediaUrl(fileName),
        mimeType: normalizedMimeType,
        mediaType,
        sizeBytes: buffer.length
    };
}

function sanitizeUsername(username) {
    if (typeof username !== 'string') return '';
    return username.trim();
}

function isValidUsername(username) {
    return /^[a-zA-Z0-9_-]{3,24}$/.test(username);
}

function isValidPassword(password) {
    return typeof password === 'string' && password.length >= 6 && password.length <= 128;
}

function getClientIp(req) {
    const fwd = req.headers['x-forwarded-for'];
    if (typeof fwd === 'string' && fwd.length > 0) {
        return fwd.split(',')[0].trim();
    }
    return req.ip || req.socket.remoteAddress || 'unknown';
}

function isRateLimited(req) {
    const ip = getClientIp(req);
    const now = Date.now();
    const entry = loginAttempts.get(ip);

    if (!entry || now > entry.resetAt) {
        loginAttempts.set(ip, { count: 1, resetAt: now + LOGIN_RATE_LIMIT_WINDOW_MS });
        return false;
    }

    entry.count += 1;
    if (entry.count > LOGIN_RATE_LIMIT_MAX_ATTEMPTS) {
        return true;
    }

    return false;
}

function clearRateLimit(req) {
    loginAttempts.delete(getClientIp(req));
}

async function getUserCredits(userId) {
    const row = await get('SELECT credits FROM users WHERE id = ?', [userId]);
    return Number.isFinite(row?.credits) ? row.credits : 0;
}

async function reserveCredits(userId, cost) {
    if (cost <= 0) return true;
    const result = await run(
        'UPDATE users SET credits = credits - ? WHERE id = ? AND credits >= ?',
        [cost, userId, cost]
    );
    return result.changes > 0;
}

async function refundCredits(userId, cost) {
    if (cost <= 0) return;
    await run('UPDATE users SET credits = credits + ? WHERE id = ?', [cost, userId]);
}

function normalizePositiveInt(value, fallback, min = 1, max = 100) {
    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.min(max, Math.max(min, parsed));
}

function normalizeIntegerArray(value) {
    return Array.from(
        new Set(
            parseJsonArray(value)
                .map((item) => Number.parseInt(item, 10))
                .filter((item) => Number.isFinite(item) && item > 0)
        )
    );
}

function normalizeGeneratorMode(value) {
    const normalized = typeof value === 'string' ? value.trim() : '';
    return GENERATOR_ALLOWED_MODES.has(normalized) ? normalized : null;
}

function normalizeGeneratorProvider(value) {
    const normalized = typeof value === 'string' ? value.trim() : '';
    return GENERATOR_ALLOWED_PROVIDERS.has(normalized) ? normalized : null;
}

function normalizeGeneratorStatus(value) {
    const normalized = typeof value === 'string' ? value.trim() : '';
    return GENERATOR_ALLOWED_STATUSES.has(normalized) ? normalized : null;
}

function isTerminalGeneratorStatus(status) {
    return status === 'succeeded' || status === 'failed' || status === 'interrupted';
}

function mapGeneratorJobRow(row) {
    if (!row) return null;
    return {
        id: row.id,
        batchId: row.batch_id,
        userId: row.user_id,
        mode: row.mode,
        provider: row.provider,
        status: row.status,
        prompt: row.prompt || '',
        negativePrompt: row.negative_prompt || null,
        sourceAssetIds: normalizeIntegerArray(row.source_asset_ids),
        providerModel: row.provider_model || '',
        providerRequestId: row.provider_request_id || null,
        requestJson: parseJsonObject(row.request_json),
        resultAssetIds: normalizeIntegerArray(row.result_asset_ids),
        errorMessage: row.error_message || null,
        creditsCharged: Number.isFinite(row.credits_charged) ? row.credits_charged : 0,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        completedAt: row.completed_at || null
    };
}

function mapGeneratorAssetRow(row) {
    if (!row) return null;
    return {
        id: row.id,
        jobId: row.job_id,
        userId: row.user_id,
        mediaType: row.media_type,
        url: row.url,
        thumbnailUrl: row.thumbnail_url || null,
        width: Number.isFinite(row.width) ? row.width : null,
        height: Number.isFinite(row.height) ? row.height : null,
        durationSeconds: Number.isFinite(row.duration_seconds) ? row.duration_seconds : null,
        source: row.source || 'generator',
        createdAt: row.created_at,
        metadata: parseJsonObject(row.metadata_json),
        prompt: row.job_prompt || null,
        mode: row.job_mode || null,
        provider: row.job_provider || null,
        jobStatus: row.job_status || null,
        batchId: row.batch_id || null
    };
}

async function getGeneratorAssetsByIds(userId, assetIds) {
    const ids = Array.from(
        new Set(
            assetIds
                .map((value) => Number.parseInt(value, 10))
                .filter((value) => Number.isFinite(value) && value > 0)
        )
    );

    if (ids.length === 0) {
        return [];
    }

    const placeholders = ids.map(() => '?').join(', ');
    const rows = await all(
        `
      SELECT
        a.*,
        j.prompt AS job_prompt,
        j.mode AS job_mode,
        j.provider AS job_provider,
        j.status AS job_status,
        j.batch_id
      FROM generator_assets a
      LEFT JOIN generator_jobs j ON j.id = a.job_id
      WHERE a.user_id = ? AND a.id IN (${placeholders})
      ORDER BY a.id DESC
    `,
        [userId, ...ids]
    );

    return rows.map(mapGeneratorAssetRow);
}

function isBlockedRemoteHost(hostname) {
    const host = String(hostname || '')
        .trim()
        .toLowerCase();
    if (!host) return true;
    if (host === 'localhost' || host === '0.0.0.0' || host === '::1' || host.endsWith('.local')) {
        return true;
    }

    const normalized = host.replace(/^\[|\]$/g, '');
    if (net.isIP(normalized) === 4) {
        return /^(10\.|127\.|192\.168\.|172\.(1[6-9]|2\d|3[0-1])\.|169\.254\.)/.test(normalized);
    }
    if (net.isIP(normalized) === 6) {
        return (
            normalized === '::1' ||
            normalized.startsWith('fc') ||
            normalized.startsWith('fd') ||
            normalized.startsWith('fe80:')
        );
    }

    return false;
}

function validateRemoteMediaUrl(rawUrl) {
    let parsed;
    try {
        parsed = new URL(rawUrl);
    } catch {
        throw new Error('A valid remote URL is required.');
    }

    if (!/^https?:$/i.test(parsed.protocol)) {
        throw new Error('Only http or https media URLs are supported.');
    }

    if (isBlockedRemoteHost(parsed.hostname)) {
        throw new Error('Importing media from local or private addresses is not allowed.');
    }

    return parsed;
}

async function importRemoteMedia(remoteUrl) {
    const parsed = validateRemoteMediaUrl(remoteUrl);
    const response = await fetch(parsed.toString());
    if (!response.ok) {
        throw new Error(`Failed to fetch remote media (${response.status}).`);
    }

    const contentLength = normalizePositiveInt(
        response.headers.get('content-length'),
        0,
        0,
        Number.MAX_SAFE_INTEGER
    );
    if (contentLength > MAX_REMOTE_MEDIA_BYTES) {
        throw new Error('Remote media file is too large to import.');
    }

    const mimeType = normalizeMimeType(response.headers.get('content-type'));
    if (!mediaTypeForMimeType(mimeType)) {
        throw new Error('Remote media type is not supported.');
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    return storeMediaBuffer(buffer, mimeType, MAX_REMOTE_MEDIA_BYTES);
}

function normalizeGrokImageInput(value) {
    if (!value) return null;

    if (typeof value === 'string' && value.trim()) {
        return {
            url: value.trim(),
            type: 'image_url'
        };
    }

    if (
        typeof value === 'object' &&
        !Array.isArray(value) &&
        typeof value.url === 'string' &&
        value.url.trim()
    ) {
        return {
            url: value.url.trim(),
            type:
                typeof value.type === 'string' && value.type.trim()
                    ? value.type.trim()
                    : 'image_url'
        };
    }

    return null;
}

function normalizeTtsTextInput(value) {
    if (typeof value !== 'string') return '';
    return value
        .replace(/\r\n?/g, '\n')
        .replace(/[ \t]+\n/g, '\n')
        .trim();
}

function normalizeTtsVoiceId(value) {
    const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';
    return normalized || DEFAULT_GROK_TTS_VOICE_ID;
}

function normalizeTtsLanguage(value) {
    const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';
    return normalized || DEFAULT_GROK_TTS_LANGUAGE;
}

function requireAuth(req, res, next) {
    if (!req.session || !req.session.userId) {
        res.redirect('/');
        return;
    }
    next();
}

function requireApiAuth(req, res, next) {
    if (!req.session || !req.session.userId) {
        res.status(401).json({ error: 'Unauthorized.' });
        return;
    }
    next();
}

async function requireAdmin(req, res, next) {
    if (!req.session || !req.session.userId) {
        res.status(401).json({ error: 'Unauthorized.' });
        return;
    }

    if (req.session.isAdmin === true) {
        next();
        return;
    }

    try {
        const row = await get('SELECT is_admin FROM users WHERE id = ?', [req.session.userId]);
        const isAdmin = Number.parseInt(row?.is_admin, 10) === 1;
        req.session.isAdmin = isAdmin;

        if (!isAdmin) {
            res.status(403).json({ error: 'Admin access required.' });
            return;
        }

        next();
    } catch (error) {
        console.error('Failed to verify admin access:', error);
        res.status(500).json({ error: 'Failed to verify admin access.' });
    }
}

function ensureGrokConfigured(res) {
    if (GROK_API_KEY) return true;
    res.status(503).json({ error: 'Premium service is not configured on the server.' });
    return false;
}

async function ensureDefaultAdminAccount() {
    const existingAdmin = await get('SELECT id FROM users WHERE username = ? COLLATE NOCASE', [
        DEFAULT_ADMIN_USERNAME
    ]);
    const passwordHash = await bcrypt.hash(DEFAULT_ADMIN_PASSWORD, 12);

    if (!existingAdmin) {
        await run(
            'INSERT INTO users (username, password_hash, credits, is_admin) VALUES (?, ?, ?, 1)',
            [DEFAULT_ADMIN_USERNAME, passwordHash, DEFAULT_USER_CREDITS]
        );
        return;
    }

    await run('UPDATE users SET password_hash = ?, is_admin = 1 WHERE id = ?', [
        passwordHash,
        existingAdmin.id
    ]);
}

async function initDb() {
    await run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE COLLATE NOCASE,
      password_hash TEXT NOT NULL,
      credits INTEGER NOT NULL DEFAULT ${DEFAULT_USER_CREDITS},
      is_admin INTEGER NOT NULL DEFAULT 0,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

    try {
        await run(
            `ALTER TABLE users ADD COLUMN credits INTEGER NOT NULL DEFAULT ${DEFAULT_USER_CREDITS}`
        );
    } catch (error) {
        if (!String(error?.message || '').includes('duplicate column')) {
            throw error;
        }
    }

    try {
        await run('ALTER TABLE users ADD COLUMN is_admin INTEGER NOT NULL DEFAULT 0');
    } catch (error) {
        if (!String(error?.message || '').includes('duplicate column')) {
            throw error;
        }
    }

    await run(`
    CREATE TABLE IF NOT EXISTS generator_jobs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      batch_id TEXT NOT NULL,
      mode TEXT NOT NULL,
      provider TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'queued',
      prompt TEXT NOT NULL,
      negative_prompt TEXT,
      source_asset_ids TEXT NOT NULL DEFAULT '[]',
      provider_model TEXT,
      provider_request_id TEXT,
      request_json TEXT NOT NULL DEFAULT '{}',
      result_asset_ids TEXT NOT NULL DEFAULT '[]',
      error_message TEXT,
      credits_charged INTEGER NOT NULL DEFAULT 0,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      completed_at DATETIME,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

    await run(`
    CREATE TABLE IF NOT EXISTS generator_assets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      job_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      media_type TEXT NOT NULL,
      url TEXT NOT NULL,
      thumbnail_url TEXT,
      width INTEGER,
      height INTEGER,
      duration_seconds INTEGER,
      source TEXT NOT NULL DEFAULT 'generator',
      metadata_json TEXT NOT NULL DEFAULT '{}',
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (job_id) REFERENCES generator_jobs(id),
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

    await run(
        'CREATE INDEX IF NOT EXISTS idx_generator_jobs_user_created ON generator_jobs(user_id, created_at DESC)'
    );
    await run(
        'CREATE INDEX IF NOT EXISTS idx_generator_jobs_user_status_updated ON generator_jobs(user_id, status, updated_at DESC)'
    );
    await run(
        'CREATE INDEX IF NOT EXISTS idx_generator_assets_user_created ON generator_assets(user_id, created_at DESC)'
    );
    await run('CREATE INDEX IF NOT EXISTS idx_generator_assets_job ON generator_assets(job_id)');

    await ensureDefaultAdminAccount();
}

app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use(express.json({ limit: MAX_JSON_BODY_BYTES }));
app.use((req, res, next) => {
    if (
        req.path === '/' ||
        req.path === '/login' ||
        req.path === '/signin' ||
        req.path.startsWith('/app')
    ) {
        res.set('Cache-Control', 'no-store');
    }
    next();
});
app.use(
    session({
        name: 'erochat_auth_sid',
        secret: SESSION_SECRET,
        resave: false,
        saveUninitialized: false,
        store: new SQLiteStore({
            db: 'sessions.sqlite',
            dir: DATA_DIR
        }),
        cookie: {
            httpOnly: true,
            sameSite: 'lax',
            secure: COOKIE_SECURE,
            maxAge: 14 * 24 * 60 * 60 * 1000
        }
    })
);

app.get('/', (req, res) => {
    res.clearCookie('erochat.sid');
    res.clearCookie('connect.sid');
    res.sendFile(path.join(ROOT_DIR, 'login.html'));
});

app.get(['/login', '/signin'], (req, res) => {
    res.redirect('/');
});

app.post('/api/auth/signup', async (req, res) => {
    const username = sanitizeUsername(req.body?.username);
    const password = req.body?.password;

    if (!isValidUsername(username)) {
        res.status(400).json({ error: 'Username must be 3-24 chars: letters, numbers, _ or -.' });
        return;
    }

    if (!isValidPassword(password)) {
        res.status(400).json({ error: 'Password must be between 6 and 128 characters.' });
        return;
    }

    try {
        const passwordHash = await bcrypt.hash(password, 12);
        const result = await run(
            'INSERT INTO users (username, password_hash, credits) VALUES (?, ?, ?)',
            [username, passwordHash, DEFAULT_USER_CREDITS]
        );

        req.session.userId = result.lastID;
        req.session.username = username;
        req.session.isAdmin = false;

        res.status(201).json({ ok: true, username, credits: DEFAULT_USER_CREDITS, isAdmin: false });
    } catch (error) {
        if (error && error.code === 'SQLITE_CONSTRAINT') {
            res.status(409).json({ error: 'Username is already taken.' });
            return;
        }
        console.error('Signup failed:', error);
        res.status(500).json({ error: 'Failed to create account.' });
    }
});

app.post('/api/auth/login', async (req, res) => {
    if (isRateLimited(req)) {
        res.status(429).json({ error: 'Too many login attempts. Try again later.' });
        return;
    }

    const username = sanitizeUsername(req.body?.username);
    const password = req.body?.password;

    if (!username || typeof password !== 'string') {
        res.status(400).json({ error: 'Username and password are required.' });
        return;
    }

    try {
        const user = await get(
            'SELECT id, username, password_hash, credits, is_admin FROM users WHERE username = ? COLLATE NOCASE',
            [username]
        );

        if (!user) {
            res.status(401).json({ error: 'Invalid username or password.' });
            return;
        }

        const ok = await bcrypt.compare(password, user.password_hash);
        if (!ok) {
            res.status(401).json({ error: 'Invalid username or password.' });
            return;
        }

        clearRateLimit(req);
        req.session.userId = user.id;
        req.session.username = user.username;
        req.session.isAdmin = Number.parseInt(user.is_admin, 10) === 1;

        res.json({
            ok: true,
            username: user.username,
            credits: user.credits,
            isAdmin: req.session.isAdmin
        });
    } catch (error) {
        console.error('Login failed:', error);
        res.status(500).json({ error: 'Failed to log in.' });
    }
});

app.post('/api/auth/logout', (req, res) => {
    if (!req.session) {
        res.json({ ok: true });
        return;
    }

    req.session.destroy((destroyErr) => {
        if (destroyErr) {
            console.error('Logout failed:', destroyErr);
            res.status(500).json({ error: 'Failed to log out.' });
            return;
        }

        res.clearCookie('erochat_auth_sid');
        res.json({ ok: true });
    });
});

app.get('/api/auth/me', async (req, res) => {
    if (!req.session || !req.session.userId) {
        res.status(401).json({ authenticated: false });
        return;
    }

    try {
        const user = await get('SELECT id, username, credits, is_admin FROM users WHERE id = ?', [
            req.session.userId
        ]);
        if (!user) {
            req.session.destroy(() => {});
            res.status(401).json({ authenticated: false });
            return;
        }

        const isAdmin = Number.parseInt(user.is_admin, 10) === 1;
        req.session.username = user.username;
        req.session.isAdmin = isAdmin;

        res.json({
            authenticated: true,
            user: {
                id: user.id,
                username: user.username,
                credits: Number.isFinite(user.credits) ? user.credits : 0,
                isAdmin
            }
        });
    } catch (error) {
        console.error('Failed to load current user:', error);
        res.status(500).json({ error: 'Failed to load current user.' });
    }
});

app.get('/api/credits/me', requireApiAuth, async (req, res) => {
    try {
        const credits = await getUserCredits(req.session.userId);
        res.json({
            credits,
            costs: getCreditCosts()
        });
    } catch (error) {
        console.error('Failed to load credits:', error);
        res.status(500).json({ error: 'Failed to load credits.' });
    }
});

app.post('/api/media/store', requireApiAuth, async (req, res) => {
    const parsed = parseBase64DataUrl(req.body?.dataUrl);
    if (!parsed) {
        res.status(400).json({ error: 'A valid Base64 data URL is required.' });
        return;
    }

    try {
        const stored = await storeMediaBuffer(
            parsed.buffer,
            parsed.mimeType,
            MAX_INLINE_MEDIA_BYTES
        );
        res.status(201).json(stored);
    } catch (error) {
        console.error('Failed to store media from data URL:', error);
        res.status(400).json({ error: error.message || 'Failed to store media.' });
    }
});

app.post('/api/media/upload', requireApiAuth, upload.single('file'), async (req, res) => {
    if (!req.file) {
        res.status(400).json({ error: 'A media file is required.' });
        return;
    }

    try {
        const stored = await storeMediaBuffer(
            req.file.buffer,
            req.file.mimetype,
            MAX_UPLOADED_MEDIA_BYTES
        );
        res.status(201).json(stored);
    } catch (error) {
        console.error('Failed to store uploaded media:', error);
        res.status(400).json({ error: error.message || 'Failed to store uploaded media.' });
    }
});

app.post('/api/characters/import-card', requireApiAuth, upload.single('file'), async (req, res) => {
    if (!req.file) {
        res.status(400).json({ error: 'A character card file is required.' });
        return;
    }

    try {
        const parsed = parseCharacterCardImportFile(req.file);
        let thumbnailUrl = null;

        if (parsed.thumbnailBuffer && parsed.thumbnailMimeType) {
            const storedThumbnail = await storeMediaBuffer(
                parsed.thumbnailBuffer,
                parsed.thumbnailMimeType,
                MAX_UPLOADED_MEDIA_BYTES
            );
            thumbnailUrl = storedThumbnail.url;
        }

        res.status(201).json({
            card: parsed.card,
            thumbnailUrl,
            fileName: parsed.fileName,
            warnings: parsed.warnings
        });
    } catch (error) {
        const statusCode = Number.isFinite(error?.statusCode) ? error.statusCode : 400;
        console.error('Failed to import character card:', error);
        res.status(statusCode).json({
            error: error?.message || 'Failed to import character card.'
        });
    }
});

app.post('/api/media/import-remote', requireApiAuth, async (req, res) => {
    const remoteUrl = typeof req.body?.url === 'string' ? req.body.url.trim() : '';
    if (!remoteUrl) {
        res.status(400).json({ error: 'A remote URL is required.' });
        return;
    }

    try {
        const stored = await importRemoteMedia(remoteUrl);
        res.status(201).json(stored);
    } catch (error) {
        console.error('Failed to import remote media:', error);
        res.status(400).json({ error: error.message || 'Failed to import remote media.' });
    }
});

app.get('/api/admin/users', requireApiAuth, requireAdmin, async (req, res) => {
    try {
        const rows = await all(
            'SELECT id, username, credits, is_admin, created_at FROM users ORDER BY username COLLATE NOCASE ASC'
        );
        const users = rows.map((row) => ({
            id: row.id,
            username: row.username,
            credits: Number.isFinite(row.credits) ? row.credits : 0,
            isAdmin: Number.parseInt(row.is_admin, 10) === 1,
            createdAt: row.created_at
        }));

        res.json({ users });
    } catch (error) {
        console.error('Failed to list admin users:', error);
        res.status(500).json({ error: 'Failed to load users.' });
    }
});

app.patch('/api/admin/users/:userId/credits', requireApiAuth, requireAdmin, async (req, res) => {
    const userId = Number.parseInt(req.params?.userId, 10);
    const credits = Number(req.body?.credits);

    if (!Number.isFinite(userId) || userId <= 0) {
        res.status(400).json({ error: 'Invalid user ID.' });
        return;
    }

    if (!Number.isInteger(credits) || credits < 0 || credits > 1000000000) {
        res.status(400).json({ error: 'Credits must be an integer between 0 and 1000000000.' });
        return;
    }

    try {
        const result = await run('UPDATE users SET credits = ? WHERE id = ?', [credits, userId]);
        if (!result.changes) {
            res.status(404).json({ error: 'User not found.' });
            return;
        }

        const updated = await get(
            'SELECT id, username, credits, is_admin FROM users WHERE id = ?',
            [userId]
        );
        if (!updated) {
            res.status(404).json({ error: 'User not found.' });
            return;
        }

        res.json({
            ok: true,
            user: {
                id: updated.id,
                username: updated.username,
                credits: Number.isFinite(updated.credits) ? updated.credits : 0,
                isAdmin: Number.parseInt(updated.is_admin, 10) === 1
            }
        });
    } catch (error) {
        console.error('Failed to update user credits:', error);
        res.status(500).json({ error: 'Failed to update credits.' });
    }
});

async function handleChargedGrokRequest(req, res, { path: upstreamPath, payload, cost }) {
    if (!ensureGrokConfigured(res)) return;

    const userId = req.session.userId;

    try {
        const hasCredits = await reserveCredits(userId, cost);
        if (!hasCredits) {
            const credits = await getUserCredits(userId);
            res.status(402).json({
                error: `Not enough credits. Required: ${cost}.`,
                credits,
                required: cost,
                costs: getCreditCosts()
            });
            return;
        }

        let response;
        try {
            response = await fetch(`https://api.x.ai${upstreamPath}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${GROK_API_KEY}`
                },
                body: JSON.stringify(payload)
            });
        } catch (error) {
            await refundCredits(userId, cost);
            throw error;
        }

        const rawBody = await response.text();
        const parsedBody = jsonOrNull(rawBody);

        if (!response.ok) {
            await refundCredits(userId, cost);
            const upstreamMessage =
                parsedBody?.error?.message ||
                rawBody ||
                `Grok request failed (${response.status}).`;
            res.status(response.status).json({ error: upstreamMessage });
            return;
        }

        const remainingCredits = await getUserCredits(userId);
        const body = parsedBody && typeof parsedBody === 'object' ? parsedBody : {};
        body._credits = {
            remaining: remainingCredits,
            costCharged: cost
        };
        res.status(response.status).json(body);
    } catch (error) {
        console.error('Grok proxy request failed:', error);
        res.status(500).json({ error: 'Failed to process Grok request.' });
    }
}

async function handleChargedGrokAudioRequest(req, res, { path: upstreamPath, payload, cost }) {
    if (!ensureGrokConfigured(res)) return;

    const userId = req.session.userId;

    try {
        const hasCredits = await reserveCredits(userId, cost);
        if (!hasCredits) {
            const credits = await getUserCredits(userId);
            res.status(402).json({
                error: `Not enough credits. Required: ${cost}.`,
                credits,
                required: cost,
                costs: getCreditCosts()
            });
            return;
        }

        let response;
        try {
            response = await fetch(`https://api.x.ai${upstreamPath}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${GROK_API_KEY}`
                },
                body: JSON.stringify(payload)
            });
        } catch (error) {
            await refundCredits(userId, cost);
            throw error;
        }

        if (!response.ok) {
            const rawBody = await response.text();
            const parsedBody = jsonOrNull(rawBody);
            await refundCredits(userId, cost);
            const upstreamMessage =
                parsedBody?.error?.message ||
                parsedBody?.error ||
                rawBody ||
                `Grok request failed (${response.status}).`;
            res.status(response.status).json({ error: upstreamMessage });
            return;
        }

        let buffer;
        try {
            const arrayBuffer = await response.arrayBuffer();
            buffer = Buffer.from(arrayBuffer);
        } catch (error) {
            await refundCredits(userId, cost);
            throw error;
        }

        const remainingCredits = await getUserCredits(userId);
        const contentType = normalizeMimeType(response.headers.get('content-type')) || 'audio/mpeg';

        res.status(response.status);
        res.set('Content-Type', contentType);
        res.set('Content-Length', String(buffer.length));
        res.set('Cache-Control', 'no-store');
        res.set('X-Credits-Remaining', String(remainingCredits));
        res.set('X-Credits-Cost', String(cost));
        res.send(buffer);
    } catch (error) {
        console.error('Grok proxy audio request failed:', error);
        res.status(500).json({ error: 'Failed to process Grok TTS request.' });
    }
}

app.get('/api/premium/tts/voices', requireApiAuth, async (req, res) => {
    if (!ensureGrokConfigured(res)) return;

    try {
        const response = await fetch('https://api.x.ai/v1/tts/voices', {
            method: 'GET',
            headers: {
                Authorization: `Bearer ${GROK_API_KEY}`
            }
        });

        const rawBody = await response.text();
        const parsedBody = jsonOrNull(rawBody);

        if (!response.ok) {
            const upstreamMessage =
                parsedBody?.error?.message ||
                parsedBody?.error ||
                rawBody ||
                `Failed to fetch TTS voices (${response.status}).`;
            res.status(response.status).json({ error: upstreamMessage });
            return;
        }

        res.status(200).json(
            parsedBody && typeof parsedBody === 'object' ? parsedBody : { voices: [] }
        );
    } catch (error) {
        console.error('Failed to fetch Grok TTS voices:', error);
        res.status(500).json({ error: 'Failed to fetch TTS voices.' });
    }
});

app.post('/api/premium/tts', requireApiAuth, async (req, res) => {
    const text = normalizeTtsTextInput(req.body?.text);
    if (!text) {
        res.status(400).json({ error: 'Text is required.' });
        return;
    }

    if (text.length > MAX_GROK_TTS_TEXT_LENGTH) {
        res.status(400).json({
            error: `Text must be ${MAX_GROK_TTS_TEXT_LENGTH} characters or fewer.`
        });
        return;
    }

    const payload = {
        text,
        voice_id: normalizeTtsVoiceId(req.body?.voice_id),
        language: normalizeTtsLanguage(req.body?.language),
        output_format: { ...DEFAULT_GROK_TTS_OUTPUT_FORMAT }
    };

    await handleChargedGrokAudioRequest(req, res, {
        path: '/v1/tts',
        payload,
        cost: CREDIT_COST_GROK_TTS
    });
});

app.post('/api/premium/chat', requireApiAuth, async (req, res) => {
    const messages = Array.isArray(req.body?.messages) ? req.body.messages : null;

    if (!messages || messages.length === 0) {
        res.status(400).json({ error: 'Messages are required.' });
        return;
    }

    await handleChargedGrokRequest(req, res, {
        path: '/v1/chat/completions',
        payload: {
            model: PREMIUM_GROK_CHAT_MODEL,
            messages,
            temperature: Number.isFinite(req.body?.temperature) ? req.body.temperature : 0.9,
            max_tokens: Number.isFinite(req.body?.max_tokens) ? req.body.max_tokens : 2000
        },
        cost: CREDIT_COST_GROK_CHAT
    });
});

app.post('/api/premium/image', requireApiAuth, async (req, res) => {
    const prompt = typeof req.body?.prompt === 'string' ? req.body.prompt.trim() : '';
    if (!prompt) {
        res.status(400).json({ error: 'Prompt is required.' });
        return;
    }

    const payload = {
        model: typeof req.body?.model === 'string' ? req.body.model : 'grok-imagine-image',
        prompt,
        n: Number.isFinite(req.body?.n) ? req.body.n : 1,
        response_format:
            typeof req.body?.response_format === 'string' ? req.body.response_format : 'b64_json'
    };

    if (typeof req.body?.aspect_ratio === 'string') {
        payload.aspect_ratio = req.body.aspect_ratio;
    }
    if (typeof req.body?.resolution === 'string') {
        payload.resolution = req.body.resolution;
    }

    await handleChargedGrokRequest(req, res, {
        path: '/v1/images/generations',
        payload,
        cost: CREDIT_COST_GROK_IMAGE
    });
});

app.post('/api/premium/image/edit', requireApiAuth, async (req, res) => {
    const prompt = typeof req.body?.prompt === 'string' ? req.body.prompt.trim() : '';
    if (!prompt) {
        res.status(400).json({ error: 'Prompt is required.' });
        return;
    }

    const image = normalizeGrokImageInput(req.body?.image);
    const images = Array.isArray(req.body?.images)
        ? req.body.images.map(normalizeGrokImageInput).filter(Boolean).slice(0, 3)
        : [];

    if (!image && images.length === 0) {
        res.status(400).json({ error: 'At least one source image is required.' });
        return;
    }

    const payload = {
        model: typeof req.body?.model === 'string' ? req.body.model : 'grok-imagine-image',
        prompt,
        response_format:
            typeof req.body?.response_format === 'string' ? req.body.response_format : 'b64_json'
    };

    if (image) {
        payload.image = image;
    }
    if (images.length > 0) {
        payload.images = images;
    }
    if (typeof req.body?.aspect_ratio === 'string') {
        payload.aspect_ratio = req.body.aspect_ratio;
    }
    if (typeof req.body?.resolution === 'string') {
        payload.resolution = req.body.resolution;
    }

    await handleChargedGrokRequest(req, res, {
        path: '/v1/images/edits',
        payload,
        cost: CREDIT_COST_GROK_IMAGE
    });
});

app.post('/api/premium/video', requireApiAuth, async (req, res) => {
    const imageInput = normalizeGrokImageInput(req.body?.image);
    if (!imageInput) {
        res.status(400).json({ error: 'Image URL is required.' });
        return;
    }

    const duration = normalizePositiveInt(req.body?.duration, 4, 1, 15);
    const payload = {
        model: typeof req.body?.model === 'string' ? req.body.model : 'grok-imagine-video',
        prompt:
            typeof req.body?.prompt === 'string' && req.body.prompt.trim()
                ? req.body.prompt.trim()
                : 'Animate this image into a short cinematic video.',
        duration,
        resolution: typeof req.body?.resolution === 'string' ? req.body.resolution : '480p',
        image: imageInput
    };

    if (typeof req.body?.aspect_ratio === 'string') {
        payload.aspect_ratio = req.body.aspect_ratio;
    }

    await handleChargedGrokRequest(req, res, {
        path: '/v1/videos/generations',
        payload,
        cost: CREDIT_COST_GROK_VIDEO
    });
});

app.get('/api/premium/video/:requestId', requireApiAuth, async (req, res) => {
    if (!ensureGrokConfigured(res)) return;

    const requestId = (req.params?.requestId || '').trim();
    if (!requestId) {
        res.status(400).json({ error: 'Request ID is required.' });
        return;
    }

    try {
        const response = await fetch(`https://api.x.ai/v1/videos/${requestId}`, {
            method: 'GET',
            headers: {
                Authorization: `Bearer ${GROK_API_KEY}`
            }
        });

        const rawBody = await response.text();
        const parsedBody = jsonOrNull(rawBody);

        if (!response.ok) {
            const upstreamMessage =
                parsedBody?.error?.message ||
                rawBody ||
                `Failed to fetch video status (${response.status}).`;
            res.status(response.status).json({ error: upstreamMessage });
            return;
        }

        res.status(200).json(parsedBody && typeof parsedBody === 'object' ? parsedBody : {});
    } catch (error) {
        console.error('Failed to fetch Grok video status:', error);
        res.status(500).json({ error: 'Failed to fetch video status.' });
    }
});

app.get('/api/generator/jobs', requireApiAuth, async (req, res) => {
    const userId = req.session.userId;
    const limit = normalizePositiveInt(req.query?.limit, 40, 1, 100);
    const cursor = normalizePositiveInt(req.query?.cursor, 0, 0, Number.MAX_SAFE_INTEGER);
    const statusFilter =
        req.query?.status == null || req.query.status === ''
            ? null
            : normalizeGeneratorStatus(req.query.status);

    if (req.query?.status && !statusFilter) {
        res.status(400).json({ error: 'Invalid generator status filter.' });
        return;
    }

    const params = [userId];
    let query = 'SELECT * FROM generator_jobs WHERE user_id = ?';

    if (statusFilter) {
        query += ' AND status = ?';
        params.push(statusFilter);
    }

    if (cursor > 0) {
        query += ' AND id < ?';
        params.push(cursor);
    }

    query += ' ORDER BY id DESC LIMIT ?';
    params.push(limit);

    try {
        const rows = await all(query, params);
        res.json({
            jobs: rows.map(mapGeneratorJobRow),
            nextCursor: rows.length === limit ? rows[rows.length - 1].id : null
        });
    } catch (error) {
        console.error('Failed to load generator jobs:', error);
        res.status(500).json({ error: 'Failed to load generator jobs.' });
    }
});

app.post('/api/generator/jobs', requireApiAuth, async (req, res) => {
    const userId = req.session.userId;
    const inputJobs = Array.isArray(req.body?.jobs) ? req.body.jobs : null;
    if (!inputJobs || inputJobs.length === 0) {
        res.status(400).json({ error: 'At least one generator job is required.' });
        return;
    }

    if (inputJobs.length > 20) {
        res.status(400).json({ error: 'Too many generator jobs were submitted at once.' });
        return;
    }

    const insertedIds = [];

    try {
        for (const inputJob of inputJobs) {
            const mode = normalizeGeneratorMode(inputJob?.mode);
            const provider = normalizeGeneratorProvider(inputJob?.provider);
            const prompt = typeof inputJob?.prompt === 'string' ? inputJob.prompt.trim() : '';

            if (!mode || !provider || !prompt) {
                res.status(400).json({
                    error: 'Each generator job requires mode, provider, and prompt.'
                });
                return;
            }

            const batchId =
                typeof inputJob?.batchId === 'string' && inputJob.batchId.trim()
                    ? inputJob.batchId.trim()
                    : generateMediaFileId();
            const negativePrompt =
                typeof inputJob?.negativePrompt === 'string' && inputJob.negativePrompt.trim()
                    ? inputJob.negativePrompt.trim()
                    : null;
            const sourceAssetIds = Array.isArray(inputJob?.sourceAssetIds)
                ? Array.from(
                      new Set(
                          inputJob.sourceAssetIds
                              .map((value) => Number.parseInt(value, 10))
                              .filter((value) => Number.isFinite(value) && value > 0)
                      )
                  )
                : [];
            const providerModel =
                typeof inputJob?.providerModel === 'string' ? inputJob.providerModel.trim() : '';
            const requestJson =
                inputJob?.requestJson &&
                typeof inputJob.requestJson === 'object' &&
                !Array.isArray(inputJob.requestJson)
                    ? inputJob.requestJson
                    : {};

            const result = await run(
                `
          INSERT INTO generator_jobs (
            user_id,
            batch_id,
            mode,
            provider,
            status,
            prompt,
            negative_prompt,
            source_asset_ids,
            provider_model,
            request_json
          ) VALUES (?, ?, ?, ?, 'queued', ?, ?, ?, ?, ?)
        `,
                [
                    userId,
                    batchId,
                    mode,
                    provider,
                    prompt,
                    negativePrompt,
                    stringifyJson(sourceAssetIds, []),
                    providerModel,
                    stringifyJson(requestJson, {})
                ]
            );

            insertedIds.push(result.lastID);
        }

        const placeholders = insertedIds.map(() => '?').join(', ');
        const rows = await all(
            `SELECT * FROM generator_jobs WHERE user_id = ? AND id IN (${placeholders}) ORDER BY id DESC`,
            [userId, ...insertedIds]
        );

        res.status(201).json({ jobs: rows.map(mapGeneratorJobRow) });
    } catch (error) {
        console.error('Failed to create generator jobs:', error);
        res.status(500).json({ error: 'Failed to create generator jobs.' });
    }
});

app.patch('/api/generator/jobs/:jobId', requireApiAuth, async (req, res) => {
    const userId = req.session.userId;
    const jobId = Number.parseInt(req.params?.jobId, 10);
    if (!Number.isFinite(jobId) || jobId <= 0) {
        res.status(400).json({ error: 'Invalid generator job ID.' });
        return;
    }

    try {
        const existing = await get('SELECT * FROM generator_jobs WHERE id = ? AND user_id = ?', [
            jobId,
            userId
        ]);
        if (!existing) {
            res.status(404).json({ error: 'Generator job not found.' });
            return;
        }

        const status =
            req.body?.status == null ? existing.status : normalizeGeneratorStatus(req.body.status);
        if (!status) {
            res.status(400).json({ error: 'Invalid generator job status.' });
            return;
        }

        const providerRequestId =
            req.body?.providerRequestId === null
                ? null
                : typeof req.body?.providerRequestId === 'string' &&
                    req.body.providerRequestId.trim()
                  ? req.body.providerRequestId.trim()
                  : existing.provider_request_id;

        const errorMessage =
            req.body?.errorMessage === null
                ? null
                : typeof req.body?.errorMessage === 'string' && req.body.errorMessage.trim()
                  ? req.body.errorMessage.trim()
                  : existing.error_message;

        const requestJson =
            req.body?.requestJson &&
            typeof req.body.requestJson === 'object' &&
            !Array.isArray(req.body.requestJson)
                ? req.body.requestJson
                : parseJsonObject(existing.request_json);

        const creditsCharged = Number.isFinite(req.body?.creditsCharged)
            ? Math.max(0, Math.trunc(req.body.creditsCharged))
            : Number.isFinite(existing.credits_charged)
              ? existing.credits_charged
              : 0;

        const assetInputs = Array.isArray(req.body?.assets) ? req.body.assets : [];
        const insertedAssetIds = [];

        for (const assetInput of assetInputs) {
            const mediaType =
                assetInput?.mediaType === 'video'
                    ? 'video'
                    : assetInput?.mediaType === 'image'
                      ? 'image'
                      : null;
            const url = typeof assetInput?.url === 'string' ? assetInput.url.trim() : '';
            const thumbnailUrl =
                typeof assetInput?.thumbnailUrl === 'string' && assetInput.thumbnailUrl.trim()
                    ? assetInput.thumbnailUrl.trim()
                    : null;

            if (!mediaType || !url || !url.startsWith('/app/media/')) {
                res.status(400).json({
                    error: 'Generator assets must use stored /app/media/ URLs.'
                });
                return;
            }

            const width = Number.isFinite(assetInput?.width)
                ? Math.max(0, Math.trunc(assetInput.width))
                : null;
            const height = Number.isFinite(assetInput?.height)
                ? Math.max(0, Math.trunc(assetInput.height))
                : null;
            const durationSeconds = Number.isFinite(assetInput?.durationSeconds)
                ? Math.max(0, Math.trunc(assetInput.durationSeconds))
                : null;
            const metadata =
                assetInput?.metadata &&
                typeof assetInput.metadata === 'object' &&
                !Array.isArray(assetInput.metadata)
                    ? assetInput.metadata
                    : {};

            const result = await run(
                `
          INSERT INTO generator_assets (
            job_id,
            user_id,
            media_type,
            url,
            thumbnail_url,
            width,
            height,
            duration_seconds,
            source,
            metadata_json
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'generator', ?)
        `,
                [
                    jobId,
                    userId,
                    mediaType,
                    url,
                    thumbnailUrl,
                    width,
                    height,
                    durationSeconds,
                    stringifyJson(metadata, {})
                ]
            );

            insertedAssetIds.push(result.lastID);
        }

        const existingResultAssetIds = normalizeIntegerArray(existing.result_asset_ids);
        const resultAssetIds = Array.isArray(req.body?.resultAssetIds)
            ? Array.from(
                  new Set(
                      req.body.resultAssetIds
                          .map((value) => Number.parseInt(value, 10))
                          .filter((value) => Number.isFinite(value) && value > 0)
                  )
              )
            : Array.from(new Set([...existingResultAssetIds, ...insertedAssetIds]));

        let completedAt = existing.completed_at || null;
        if (req.body?.completedAt === null) {
            completedAt = null;
        } else if (typeof req.body?.completedAt === 'string' && req.body.completedAt.trim()) {
            completedAt = req.body.completedAt.trim();
        } else if (isTerminalGeneratorStatus(status) && !completedAt) {
            completedAt = new Date().toISOString();
        }

        await run(
            `
        UPDATE generator_jobs
        SET
          status = ?,
          provider_request_id = ?,
          request_json = ?,
          result_asset_ids = ?,
          error_message = ?,
          credits_charged = ?,
          updated_at = CURRENT_TIMESTAMP,
          completed_at = ?
        WHERE id = ? AND user_id = ?
      `,
            [
                status,
                providerRequestId,
                stringifyJson(requestJson, {}),
                stringifyJson(resultAssetIds, []),
                errorMessage,
                creditsCharged,
                completedAt,
                jobId,
                userId
            ]
        );

        const updatedJob = await get('SELECT * FROM generator_jobs WHERE id = ? AND user_id = ?', [
            jobId,
            userId
        ]);
        const createdAssets = await getGeneratorAssetsByIds(userId, insertedAssetIds);

        res.json({
            job: mapGeneratorJobRow(updatedJob),
            assets: createdAssets
        });
    } catch (error) {
        console.error('Failed to update generator job:', error);
        res.status(500).json({ error: 'Failed to update generator job.' });
    }
});

app.get('/api/generator/assets', requireApiAuth, async (req, res) => {
    const userId = req.session.userId;
    const limit = normalizePositiveInt(req.query?.limit, 60, 1, 120);
    const cursor = normalizePositiveInt(req.query?.cursor, 0, 0, Number.MAX_SAFE_INTEGER);

    const params = [userId];
    let query = `
    SELECT
      a.*,
      j.prompt AS job_prompt,
      j.mode AS job_mode,
      j.provider AS job_provider,
      j.status AS job_status,
      j.batch_id
    FROM generator_assets a
    LEFT JOIN generator_jobs j ON j.id = a.job_id
    WHERE a.user_id = ?
  `;

    if (cursor > 0) {
        query += ' AND a.id < ?';
        params.push(cursor);
    }

    query += ' ORDER BY a.id DESC LIMIT ?';
    params.push(limit);

    try {
        const rows = await all(query, params);
        res.json({
            assets: rows.map(mapGeneratorAssetRow),
            nextCursor: rows.length === limit ? rows[rows.length - 1].id : null
        });
    } catch (error) {
        console.error('Failed to load generator assets:', error);
        res.status(500).json({ error: 'Failed to load generator assets.' });
    }
});

app.get(['/app', '/app/'], requireAuth, (req, res) => {
    res.sendFile(path.join(ROOT_DIR, 'index.html'));
});

app.use('/app/css', requireAuth, express.static(path.join(ROOT_DIR, 'css')));
app.use('/app/js', requireAuth, express.static(path.join(ROOT_DIR, 'js')));
app.use('/app/media', requireAuth, express.static(MEDIA_DIR));

app.use((error, req, res, next) => {
    if (error instanceof multer.MulterError) {
        const status = error.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
        res.status(status).json({ error: error.message || 'Failed to upload media.' });
        return;
    }
    next(error);
});

app.use((req, res) => {
    res.status(404).json({ error: 'Not found' });
});

initDb()
    .then(() => {
        app.listen(PORT, () => {
            console.log(`EroChat server listening on http://localhost:${PORT}`);
        });
    })
    .catch((error) => {
        console.error('Failed to initialize database:', error);
        process.exit(1);
    });
