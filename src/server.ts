// @ts-nocheck
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
const { parseCharacterCardImportFile } = require('./character-card-import');
const {
    buildCharacterGenerationMessages,
    normalizeGeneratedCharacterDraft,
    parseGeneratedCharacterDraft
} = require('./character-generation');

const app = express();
const SQLiteStore = SQLiteStoreFactory(session);

const ROOT_DIR = path.resolve(__dirname, '..');
const DATA_DIR =
    process.env.NODE_ENV === 'test' && process.env.EROCHAT_TEST_DATA_DIR
        ? path.resolve(process.env.EROCHAT_TEST_DATA_DIR)
        : path.join(ROOT_DIR, 'data');
const MEDIA_DIR = path.join(DATA_DIR, 'media');
const DB_PATH = path.join(DATA_DIR, 'erochat.sqlite');
const PORT = Number(process.env.PORT || 20121);
const SESSION_SECRET = process.env.SESSION_SECRET || 'change-this-secret';
const COOKIE_SECURE = process.env.COOKIE_SECURE === 'true';

const MAX_JSON_BODY_BYTES = '25mb';
const MAX_INLINE_MEDIA_BYTES = 10 * 1024 * 1024;
const MAX_UPLOADED_MEDIA_BYTES = 80 * 1024 * 1024;
const MAX_REMOTE_MEDIA_BYTES = 80 * 1024 * 1024;
const DEFAULT_ADMIN_USERNAME = 'admin';
const DEFAULT_ADMIN_PASSWORD = 'admin';
const OPENROUTER_CHAT_COMPLETIONS_URL =
    process.env.NODE_ENV === 'test' && process.env.EROCHAT_TEST_OPENROUTER_URL
        ? process.env.EROCHAT_TEST_OPENROUTER_URL
        : 'https://openrouter.ai/api/v1/chat/completions';
const configuredCharacterGenerationTimeout = Number.parseInt(
    process.env.EROCHAT_TEST_CHARACTER_GENERATION_TIMEOUT_MS || '',
    10
);
const ADMIN_CHARACTER_GENERATION_TIMEOUT_MS =
    process.env.NODE_ENV === 'test' &&
    Number.isFinite(configuredCharacterGenerationTimeout) &&
    configuredCharacterGenerationTimeout > 0
        ? configuredCharacterGenerationTimeout
        : 120 * 1000;
const ADMIN_CHARACTER_REFERENCE_LIMIT = 120;
const ADMIN_CHARACTER_BRIEF_MAX_LENGTH = 2000;

const LOGIN_RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_RATE_LIMIT_MAX_ATTEMPTS = 20;
const GENERATOR_ALLOWED_MODES = new Set(['image_generate', 'video_generate']);
const GENERATOR_ALLOWED_PROVIDERS = new Set(['swarm', 'comfy', 'nanogpt', 'openrouter']);
const GENERATOR_ALLOWED_STATUSES = new Set([
    'queued',
    'starting',
    'loading',
    'generating',
    'completed',
    'failed',
    // Legacy states remain readable while persisted jobs migrate naturally.
    'running',
    'polling',
    'succeeded',
    'interrupted'
]);
const GENERATOR_ALLOWED_SOURCES = new Set(['chat', 'manual', 'regenerate', 'character-thumbnail']);
const GENERATOR_ALLOWED_MEDIA_TYPES = new Set(['image', 'video']);
const GENERATOR_ALLOWED_EXECUTION_BACKENDS = new Set(['local', 'runpod']);
const PUBLIC_CHARACTER_SORTS = new Set(['newest', 'popular', 'name']);
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

function getIntEnv(name, fallback) {
    const raw = process.env[name];
    if (raw == null || raw === '') return fallback;
    const parsed = Number.parseInt(raw, 10);
    return Number.isFinite(parsed) ? parsed : fallback;
}

const DEFAULT_USER_CREDITS = getIntEnv('DEFAULT_USER_CREDITS', 100);

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

async function ensureTableColumn(table, column, definition) {
    const columns = await all(`PRAGMA table_info(${table})`);
    if (!columns.some((item) => item.name === column)) {
        await run(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
    }
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

function limitedText(value, maxLength, required = false) {
    const text = typeof value === 'string' ? value.trim() : '';
    if (required && !text) return null;
    return text.slice(0, maxLength);
}

function normalizePublicCharacterPayload(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;

    const sourceCharacterId = limitedText(value.sourceCharacterId, 128, true);
    const name = limitedText(value.name, 100, true);
    const systemPrompt = limitedText(value.systemPrompt, 24000, true);
    if (!sourceCharacterId || !name || !systemPrompt) return null;

    const thumbnail = limitedText(value.thumbnail, 2048);
    return {
        sourceCharacterId,
        name,
        avatar: limitedText(value.avatar, 16) || '✨',
        thumbnail: thumbnail && thumbnail.startsWith('/app/media/') ? thumbnail : '',
        description: limitedText(value.description, 4000),
        appearance: limitedText(value.appearance, 4000),
        background: limitedText(value.background, 12000),
        greeting: limitedText(value.greeting, 8000),
        systemPrompt,
        contextMessageCount: normalizePositiveInt(value.contextMessageCount, 20, 1, 200)
    };
}

function mapPublicCharacterRow(row, currentUserId) {
    if (!row) return null;
    return {
        id: row.id,
        sourceCharacterId: row.source_character_id,
        creator: row.creator_username,
        creatorId: row.user_id,
        isOwner: Number(row.user_id) === Number(currentUserId),
        name: row.name,
        avatar: row.avatar || '✨',
        thumbnail: row.thumbnail || '',
        description: row.description || '',
        appearance: row.appearance || '',
        background: row.background || '',
        greeting: row.greeting || '',
        systemPrompt: row.system_prompt,
        contextMessageCount: Number(row.context_message_count) || 20,
        imports: Number(row.import_count) || 0,
        publishedAt: row.published_at,
        updatedAt: row.updated_at
    };
}

function normalizeAdminCharacterReferenceIds(value) {
    if (!Array.isArray(value) || value.length > ADMIN_CHARACTER_REFERENCE_LIMIT) {
        return null;
    }

    const ids = [];
    const seen = new Set();
    for (const item of value) {
        const id = Number(item);
        if (!Number.isInteger(id) || id <= 0 || id > Number.MAX_SAFE_INTEGER) {
            return null;
        }
        if (!seen.has(id)) {
            seen.add(id);
            ids.push(id);
        }
    }
    return ids;
}

function mapCharacterGenerationReference(row) {
    return {
        name: row.name || '',
        avatar: row.avatar || '✨',
        description: row.description || '',
        appearance: row.appearance || '',
        background: row.background || '',
        greeting: row.greeting || '',
        systemPrompt: row.system_prompt || '',
        contextMessageCount: Number(row.context_message_count) || 20
    };
}

function getOpenRouterMessageText(payload) {
    const content = payload?.choices?.[0]?.message?.content;
    if (typeof content === 'string') {
        return content.trim();
    }
    if (Array.isArray(content)) {
        return content
            .map((part) => {
                if (typeof part === 'string') return part;
                if (typeof part?.text === 'string') return part.text;
                if (typeof part?.content === 'string') return part.content;
                return '';
            })
            .join('')
            .trim();
    }
    return '';
}

async function readOpenRouterPayload(response) {
    const text = await response.text().catch(() => '');
    if (!text) return {};
    try {
        return JSON.parse(text);
    } catch {
        return { rawText: text.slice(0, 1000) };
    }
}

function openRouterErrorMessage(status) {
    if (status === 401 || status === 403) {
        return 'OpenRouter rejected the configured API key.';
    }
    if (status === 402) {
        return 'The OpenRouter account has insufficient credits.';
    }
    if (status === 429) {
        return 'OpenRouter rate limit reached. Try again shortly.';
    }
    if (status >= 500) {
        return 'OpenRouter is temporarily unavailable.';
    }
    return 'OpenRouter could not generate a character with the selected model.';
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
    return (
        status === 'completed' ||
        status === 'succeeded' ||
        status === 'failed' ||
        status === 'interrupted'
    );
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
        source: row.source || 'manual',
        mediaType: row.media_type || (row.mode === 'video_generate' ? 'video' : 'image'),
        presetId: row.preset_id || null,
        executionBackend: row.execution_backend || 'local',
        characterId: row.character_id || null,
        messageId: row.message_id || null,
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
        source: !row.source || row.source === 'generator' ? 'manual' : row.source,
        characterId: row.job_character_id || null,
        messageId: row.job_message_id || null,
        createdAt: row.created_at,
        metadata: parseJsonObject(row.metadata_json),
        prompt: row.job_prompt || null,
        mode: row.job_mode || null,
        provider: row.job_provider || null,
        providerModel: row.job_provider_model || '',
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
        j.provider_model AS job_provider_model,
        j.character_id AS job_character_id,
        j.message_id AS job_message_id,
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

function buildNanoGptApiUrl(baseUrl, pathname) {
    const trimmedBaseUrl =
        typeof baseUrl === 'string' && baseUrl.trim() ? baseUrl.trim() : 'https://nano-gpt.com';
    const parsed = validateRemoteMediaUrl(new URL(pathname, trimmedBaseUrl).toString());
    return parsed.toString();
}

async function readNanoGptResponse(response) {
    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
        return response.json().catch(() => ({}));
    }

    const text = await response.text().catch(() => '');
    return text ? { error: text } : {};
}

async function proxyNanoGptJsonRequest({ baseUrl, apiKey, pathname, method = 'GET', body = null }) {
    const targetUrl = buildNanoGptApiUrl(baseUrl, pathname);
    const headers = {
        Accept: 'application/json'
    };

    if (apiKey) {
        headers.Authorization = `Bearer ${apiKey}`;
    }

    if (body != null) {
        headers['Content-Type'] = 'application/json';
    }

    const response = await fetch(targetUrl, {
        method,
        headers,
        body: body != null ? JSON.stringify(body) : undefined
    });
    const payload = await readNanoGptResponse(response);

    return {
        ok: response.ok,
        status: response.status,
        payload
    };
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

    await run(`
    CREATE TABLE IF NOT EXISTS generator_jobs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      batch_id TEXT NOT NULL,
      mode TEXT NOT NULL,
      provider TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'queued',
      source TEXT NOT NULL DEFAULT 'manual',
      media_type TEXT NOT NULL DEFAULT 'image',
      preset_id TEXT,
      execution_backend TEXT NOT NULL DEFAULT 'local',
      character_id TEXT,
      message_id TEXT,
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

    await ensureTableColumn('generator_jobs', 'source', "TEXT NOT NULL DEFAULT 'manual'");
    await ensureTableColumn('generator_jobs', 'media_type', "TEXT NOT NULL DEFAULT 'image'");
    await ensureTableColumn('generator_jobs', 'preset_id', 'TEXT');
    await ensureTableColumn('generator_jobs', 'execution_backend', "TEXT NOT NULL DEFAULT 'local'");
    await ensureTableColumn('generator_jobs', 'character_id', 'TEXT');
    await ensureTableColumn('generator_jobs', 'message_id', 'TEXT');

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

    await run(`
    CREATE TABLE IF NOT EXISTS public_characters (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      source_character_id TEXT NOT NULL,
      name TEXT NOT NULL,
      avatar TEXT NOT NULL DEFAULT '✨',
      thumbnail TEXT,
      description TEXT,
      appearance TEXT,
      background TEXT,
      greeting TEXT,
      system_prompt TEXT NOT NULL,
      context_message_count INTEGER NOT NULL DEFAULT 20,
      import_count INTEGER NOT NULL DEFAULT 0,
      published_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (user_id, source_character_id),
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
    await run(
        'CREATE INDEX IF NOT EXISTS idx_public_characters_updated ON public_characters(updated_at DESC)'
    );
    await run(
        'CREATE INDEX IF NOT EXISTS idx_public_characters_popular ON public_characters(import_count DESC, updated_at DESC)'
    );

    await ensureDefaultAdminAccount();
}

app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use(express.json({ limit: MAX_JSON_BODY_BYTES }));
app.use((req, res, next) => {
    if (req.path === '/' || req.path.startsWith('/app')) {
        res.set('Cache-Control', 'no-store');
    }
    next();
});
app.use(express.static(path.join(ROOT_DIR, 'public')));
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
    if (req.session?.userId) {
        res.redirect('/app/');
        return;
    }

    res.sendFile(path.join(ROOT_DIR, 'login.html'));
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

app.patch('/api/auth/profile', requireApiAuth, async (req, res) => {
    const userId = req.session.userId;
    const username = sanitizeUsername(req.body?.username);
    const currentPassword =
        typeof req.body?.currentPassword === 'string' ? req.body.currentPassword : '';
    const newPassword = typeof req.body?.newPassword === 'string' ? req.body.newPassword : '';

    if (!isValidUsername(username)) {
        res.status(400).json({ error: 'Username must be 3-24 chars: letters, numbers, _ or -.' });
        return;
    }

    if (newPassword && !isValidPassword(newPassword)) {
        res.status(400).json({ error: 'Password must be between 6 and 128 characters.' });
        return;
    }

    try {
        const user = await get(
            'SELECT id, username, password_hash, credits, is_admin FROM users WHERE id = ?',
            [userId]
        );
        if (!user) {
            res.status(404).json({ error: 'User not found.' });
            return;
        }

        const updates = [];
        const params = [];

        if (username.toLowerCase() !== String(user.username || '').toLowerCase()) {
            const existing = await get(
                'SELECT id FROM users WHERE username = ? COLLATE NOCASE AND id <> ?',
                [username, userId]
            );
            if (existing) {
                res.status(409).json({ error: 'Username is already taken.' });
                return;
            }
            updates.push('username = ?');
            params.push(username);
        }

        if (newPassword) {
            if (!currentPassword) {
                res.status(400).json({ error: 'Current password is required.' });
                return;
            }

            const passwordOk = await bcrypt.compare(currentPassword, user.password_hash);
            if (!passwordOk) {
                res.status(401).json({ error: 'Current password is incorrect.' });
                return;
            }

            updates.push('password_hash = ?');
            params.push(await bcrypt.hash(newPassword, 12));
        }

        if (updates.length > 0) {
            await run(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`, [...params, userId]);
        }

        const updated = await get(
            'SELECT id, username, credits, is_admin FROM users WHERE id = ?',
            [userId]
        );
        const isAdmin = Number.parseInt(updated.is_admin, 10) === 1;
        req.session.isAdmin = isAdmin;

        res.json({
            ok: true,
            user: {
                id: updated.id,
                username: updated.username,
                credits: Number.isFinite(updated.credits) ? updated.credits : 0,
                isAdmin
            }
        });
    } catch (error) {
        console.error('Profile update failed:', error);
        res.status(500).json({ error: 'Failed to update profile.' });
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

app.get('/api/characters/browse', requireApiAuth, async (req, res) => {
    const userId = req.session.userId;
    const search = limitedText(req.query?.q, 100) || '';
    const requestedSort = limitedText(req.query?.sort, 20) || 'newest';
    const sort = PUBLIC_CHARACTER_SORTS.has(requestedSort) ? requestedSort : 'newest';
    const orderBy =
        sort === 'popular'
            ? 'c.import_count DESC, c.updated_at DESC'
            : sort === 'name'
              ? 'c.name COLLATE NOCASE ASC, c.updated_at DESC'
              : 'c.updated_at DESC';
    const params = [];
    let where = '';

    if (search) {
        where = 'WHERE c.name LIKE ? OR c.description LIKE ? OR u.username LIKE ?';
        const pattern = `%${search}%`;
        params.push(pattern, pattern, pattern);
    }

    try {
        const rows = await all(
            `
      SELECT c.*, u.username AS creator_username
      FROM public_characters c
      JOIN users u ON u.id = c.user_id
      ${where}
      ORDER BY ${orderBy}
      LIMIT 120
    `,
            params
        );
        res.json({ characters: rows.map((row) => mapPublicCharacterRow(row, userId)) });
    } catch (error) {
        console.error('Failed to browse public characters:', error);
        res.status(500).json({ error: 'Failed to load public characters.' });
    }
});

app.post('/api/characters/publish', requireApiAuth, async (req, res) => {
    const userId = req.session.userId;
    const character = normalizePublicCharacterPayload(req.body?.character);
    if (!character) {
        res.status(400).json({
            error: 'Name, system prompt, and source character id are required.'
        });
        return;
    }

    try {
        const existing = await get(
            'SELECT id FROM public_characters WHERE user_id = ? AND source_character_id = ?',
            [userId, character.sourceCharacterId]
        );
        await run(
            `
        INSERT INTO public_characters (
          user_id, source_character_id, name, avatar, thumbnail, description, appearance,
          background, greeting, system_prompt, context_message_count
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(user_id, source_character_id) DO UPDATE SET
          name = excluded.name,
          avatar = excluded.avatar,
          thumbnail = excluded.thumbnail,
          description = excluded.description,
          appearance = excluded.appearance,
          background = excluded.background,
          greeting = excluded.greeting,
          system_prompt = excluded.system_prompt,
          context_message_count = excluded.context_message_count,
          updated_at = CURRENT_TIMESTAMP
      `,
            [
                userId,
                character.sourceCharacterId,
                character.name,
                character.avatar,
                character.thumbnail,
                character.description,
                character.appearance,
                character.background,
                character.greeting,
                character.systemPrompt,
                character.contextMessageCount
            ]
        );
        const row = await get(
            `
        SELECT c.*, u.username AS creator_username
        FROM public_characters c
        JOIN users u ON u.id = c.user_id
        WHERE c.user_id = ? AND c.source_character_id = ?
      `,
            [userId, character.sourceCharacterId]
        );
        res.status(existing ? 200 : 201).json({ character: mapPublicCharacterRow(row, userId) });
    } catch (error) {
        console.error('Failed to publish character:', error);
        res.status(500).json({ error: 'Failed to publish character.' });
    }
});

app.post('/api/characters/browse/:id/import', requireApiAuth, async (req, res) => {
    const userId = req.session.userId;
    const publicationId = normalizePositiveInt(req.params.id, 0, 0, Number.MAX_SAFE_INTEGER);
    if (!publicationId) {
        res.status(400).json({ error: 'Invalid public character id.' });
        return;
    }

    try {
        const row = await get(
            `
        SELECT c.*, u.username AS creator_username
        FROM public_characters c
        JOIN users u ON u.id = c.user_id
        WHERE c.id = ?
      `,
            [publicationId]
        );
        if (!row) {
            res.status(404).json({ error: 'Public character not found.' });
            return;
        }

        await run('UPDATE public_characters SET import_count = import_count + 1 WHERE id = ?', [
            publicationId
        ]);
        row.import_count = Number(row.import_count || 0) + 1;
        res.json({ character: mapPublicCharacterRow(row, userId) });
    } catch (error) {
        console.error('Failed to import public character:', error);
        res.status(500).json({ error: 'Failed to import public character.' });
    }
});

app.delete('/api/characters/published/:id', requireApiAuth, async (req, res) => {
    const userId = req.session.userId;
    const publicationId = normalizePositiveInt(req.params.id, 0, 0, Number.MAX_SAFE_INTEGER);
    if (!publicationId) {
        res.status(400).json({ error: 'Invalid public character id.' });
        return;
    }

    try {
        const result = await run('DELETE FROM public_characters WHERE id = ? AND user_id = ?', [
            publicationId,
            userId
        ]);
        if (!result.changes) {
            res.status(404).json({ error: 'Publication not found.' });
            return;
        }
        res.json({ ok: true });
    } catch (error) {
        console.error('Failed to unpublish character:', error);
        res.status(500).json({ error: 'Failed to unpublish character.' });
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

app.post('/api/nanogpt/images/models', requireApiAuth, async (req, res) => {
    const baseUrl = typeof req.body?.baseUrl === 'string' ? req.body.baseUrl.trim() : '';
    const apiKey = typeof req.body?.apiKey === 'string' ? req.body.apiKey.trim() : '';

    try {
        const proxied = await proxyNanoGptJsonRequest({
            baseUrl,
            apiKey,
            pathname: '/api/v1/image-models?detailed=true'
        });

        res.status(proxied.status).json(proxied.payload);
    } catch (error) {
        console.error('Failed to proxy NanoGPT image models:', error);
        res.status(400).json({ error: error.message || 'Failed to fetch NanoGPT image models.' });
    }
});

app.post('/api/nanogpt/images', requireApiAuth, async (req, res) => {
    const baseUrl = typeof req.body?.baseUrl === 'string' ? req.body.baseUrl.trim() : '';
    const apiKey = typeof req.body?.apiKey === 'string' ? req.body.apiKey.trim() : '';
    const payload =
        req.body?.payload &&
        typeof req.body.payload === 'object' &&
        !Array.isArray(req.body.payload)
            ? req.body.payload
            : null;

    if (!apiKey) {
        res.status(400).json({ error: 'NanoGPT API key is required.' });
        return;
    }

    if (!payload) {
        res.status(400).json({ error: 'NanoGPT image payload is required.' });
        return;
    }

    try {
        const proxied = await proxyNanoGptJsonRequest({
            baseUrl,
            apiKey,
            pathname: '/api/v1/images/generations',
            method: 'POST',
            body: payload
        });

        res.status(proxied.status).json(proxied.payload);
    } catch (error) {
        console.error('Failed to proxy NanoGPT image generation:', error);
        res.status(400).json({ error: error.message || 'Failed to generate NanoGPT image.' });
    }
});

app.post('/api/admin/characters/generate', requireApiAuth, requireAdmin, async (req, res) => {
    const rawApiKey = req.body?.apiKey;
    const rawModel = req.body?.model;
    const rawBrief = req.body?.brief;
    const apiKey = typeof rawApiKey === 'string' ? rawApiKey.trim() : '';
    const model = typeof rawModel === 'string' ? rawModel.trim() : '';
    const brief = typeof rawBrief === 'string' ? rawBrief.trim() : '';
    const referenceCharacterIds = normalizeAdminCharacterReferenceIds(
        req.body?.referenceCharacterIds ?? []
    );

    if (!apiKey || apiKey.length > 4096) {
        res.status(400).json({ error: 'A valid OpenRouter API key is required.' });
        return;
    }
    if (!model || model.length > 300) {
        res.status(400).json({ error: 'An OpenRouter model is required.' });
        return;
    }
    if (rawBrief != null && typeof rawBrief !== 'string') {
        res.status(400).json({ error: 'The creative brief must be text.' });
        return;
    }
    if (brief.length > ADMIN_CHARACTER_BRIEF_MAX_LENGTH) {
        res.status(400).json({
            error: `The creative brief must be ${ADMIN_CHARACTER_BRIEF_MAX_LENGTH} characters or fewer.`
        });
        return;
    }
    if (!referenceCharacterIds) {
        res.status(400).json({
            error: `Reference character IDs must be a list of at most ${ADMIN_CHARACTER_REFERENCE_LIMIT} positive integers.`
        });
        return;
    }

    let references = [];
    try {
        if (referenceCharacterIds.length > 0) {
            const placeholders = referenceCharacterIds.map(() => '?').join(', ');
            const rows = await all(
                `SELECT * FROM public_characters WHERE id IN (${placeholders})`,
                referenceCharacterIds
            );
            const rowsById = new Map(rows.map((row) => [Number(row.id), row]));
            const missingIds = referenceCharacterIds.filter((id) => !rowsById.has(id));
            if (missingIds.length > 0) {
                res.status(400).json({
                    error: 'One or more selected reference characters no longer exist.'
                });
                return;
            }
            references = referenceCharacterIds.map((id) =>
                mapCharacterGenerationReference(rowsById.get(id))
            );
        }
    } catch (error) {
        console.error('Failed to load character generation references:', error);
        res.status(500).json({ error: 'Failed to load reference characters.' });
        return;
    }

    let messages;
    try {
        messages = buildCharacterGenerationMessages({ references, brief });
    } catch (error) {
        res.status(400).json({ error: error?.message || 'Invalid character generation input.' });
        return;
    }

    const abortController = new AbortController();
    const timeout = setTimeout(
        () => abortController.abort(),
        ADMIN_CHARACTER_GENERATION_TIMEOUT_MS
    );

    try {
        const response = await fetch(OPENROUTER_CHAT_COMPLETIONS_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${apiKey}`,
                'X-Title': 'EroChat'
            },
            body: JSON.stringify({
                model,
                messages,
                temperature: 0.85,
                max_tokens: 6000,
                stream: false
            }),
            signal: abortController.signal
        });
        const payload = await readOpenRouterPayload(response);

        if (!response.ok) {
            const status = response.status === 429 ? 429 : 502;
            res.status(status).json({ error: openRouterErrorMessage(response.status) });
            return;
        }

        const content = getOpenRouterMessageText(payload);
        if (!content) {
            res.status(502).json({ error: 'OpenRouter returned an empty character draft.' });
            return;
        }

        try {
            const draft = parseGeneratedCharacterDraft(content);
            res.json({ draft });
        } catch (error) {
            res.status(502).json({
                error:
                    error?.message ||
                    'The selected model returned a malformed character draft. Try again or choose another model.'
            });
        }
    } catch (error) {
        if (error?.name === 'AbortError') {
            res.status(504).json({ error: 'OpenRouter character generation timed out.' });
            return;
        }
        console.error('OpenRouter character generation failed:', error?.message || error);
        res.status(502).json({ error: 'Could not reach OpenRouter.' });
    } finally {
        clearTimeout(timeout);
    }
});

app.post('/api/admin/characters/publish', requireApiAuth, requireAdmin, async (req, res) => {
    let draft;
    try {
        draft = normalizeGeneratedCharacterDraft(req.body?.draft, {
            requireComplete: false
        });
    } catch (error) {
        res.status(400).json({
            error: error?.message || 'The generated character draft is invalid.'
        });
        return;
    }

    const userId = req.session.userId;
    const sourceCharacterId = `ai-${generateMediaFileId()}`;

    try {
        const result = await run(
            `
          INSERT INTO public_characters (
            user_id, source_character_id, name, avatar, thumbnail, description, appearance,
            background, greeting, system_prompt, context_message_count
          ) VALUES (?, ?, ?, ?, '', ?, ?, ?, ?, ?, ?)
        `,
            [
                userId,
                sourceCharacterId,
                draft.name,
                draft.avatar,
                draft.description,
                draft.appearance,
                draft.background,
                draft.greeting,
                draft.systemPrompt,
                draft.contextMessageCount
            ]
        );
        const row = await get(
            `
          SELECT c.*, u.username AS creator_username
          FROM public_characters c
          JOIN users u ON u.id = c.user_id
          WHERE c.id = ?
        `,
            [result.lastID]
        );
        res.status(201).json({ character: mapPublicCharacterRow(row, userId) });
    } catch (error) {
        console.error('Failed to publish generated character:', error);
        res.status(500).json({ error: 'Failed to publish the generated character.' });
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
            const source = GENERATOR_ALLOWED_SOURCES.has(inputJob?.source)
                ? inputJob.source
                : 'manual';
            const mediaType = GENERATOR_ALLOWED_MEDIA_TYPES.has(inputJob?.mediaType)
                ? inputJob.mediaType
                : mode === 'video_generate'
                  ? 'video'
                  : 'image';
            const executionBackend = GENERATOR_ALLOWED_EXECUTION_BACKENDS.has(
                inputJob?.executionBackend
            )
                ? inputJob.executionBackend
                : 'local';

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
            const presetId =
                typeof inputJob?.presetId === 'string' && inputJob.presetId.trim()
                    ? inputJob.presetId.trim()
                    : null;
            const characterId =
                typeof inputJob?.characterId === 'string' && inputJob.characterId.trim()
                    ? inputJob.characterId.trim()
                    : null;
            const messageId =
                typeof inputJob?.messageId === 'string' && inputJob.messageId.trim()
                    ? inputJob.messageId.trim()
                    : null;
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
            source,
            media_type,
            preset_id,
            execution_backend,
            character_id,
            message_id,
            prompt,
            negative_prompt,
            source_asset_ids,
            provider_model,
            request_json
          ) VALUES (?, ?, ?, ?, 'queued', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
                [
                    userId,
                    batchId,
                    mode,
                    provider,
                    source,
                    mediaType,
                    presetId,
                    executionBackend,
                    characterId,
                    messageId,
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
            const source = GENERATOR_ALLOWED_SOURCES.has(assetInput?.source)
                ? assetInput.source
                : existing.source || 'manual';

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
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
                    source,
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
      j.provider_model AS job_provider_model,
      j.character_id AS job_character_id,
      j.message_id AS job_message_id,
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
    res.sendFile(path.join(ROOT_DIR, 'dist', 'client', 'index.html'));
});

app.use('/app', requireAuth, express.static(path.join(ROOT_DIR, 'dist', 'client')));
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
    if (req.path.startsWith('/api/')) {
        res.status(404).json({ error: 'Not found' });
        return;
    }

    res.status(404).sendFile(path.join(ROOT_DIR, 'public', '404.html'));
});

initDb()
    .then(() => {
        const server = app.listen(PORT, () => {
            const address = server.address();
            const listeningPort =
                address && typeof address === 'object' && address.port ? address.port : PORT;
            console.log(`EroChat server listening on http://localhost:${listeningPort}`);
        });
    })
    .catch((error) => {
        console.error('Failed to initialize database:', error);
        process.exit(1);
    });
