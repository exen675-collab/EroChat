const fs = require('fs');
const path = require('path');
const express = require('express');
const session = require('express-session');
const SQLiteStoreFactory = require('connect-sqlite3');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');

const app = express();
const SQLiteStore = SQLiteStoreFactory(session);

const ROOT_DIR = __dirname;
const DATA_DIR = path.join(ROOT_DIR, 'data');
const DB_PATH = path.join(DATA_DIR, 'erochat.sqlite');
const PORT = Number(process.env.PORT || 20121);
const SESSION_SECRET = process.env.SESSION_SECRET || 'change-this-secret';
const COOKIE_SECURE = process.env.COOKIE_SECURE === 'true';
const GROK_API_KEY_FILE = process.env.GROK_API_KEY_FILE || path.join(ROOT_DIR, 'grok.key');

function readSecretFromFile(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8').trim();
  } catch {
    return '';
  }
}

const GROK_API_KEY = (process.env.GROK_API_KEY || readSecretFromFile(GROK_API_KEY_FILE) || '').trim();

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
const PREMIUM_GROK_CHAT_MODEL = 'grok-4-1-fast-reasoning';
const DEFAULT_ADMIN_USERNAME = 'admin';
const DEFAULT_ADMIN_PASSWORD = 'admin';

const LOGIN_RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_RATE_LIMIT_MAX_ATTEMPTS = 20;
const loginAttempts = new Map();

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const db = new sqlite3.Database(DB_PATH);

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

function getCreditCosts() {
  return {
    chat: CREDIT_COST_GROK_CHAT,
    image: CREDIT_COST_GROK_IMAGE,
    video: CREDIT_COST_GROK_VIDEO
  };
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
  const existingAdmin = await get(
    'SELECT id FROM users WHERE username = ? COLLATE NOCASE',
    [DEFAULT_ADMIN_USERNAME]
  );
  const passwordHash = await bcrypt.hash(DEFAULT_ADMIN_PASSWORD, 12);

  if (!existingAdmin) {
    await run(
      'INSERT INTO users (username, password_hash, credits, is_admin) VALUES (?, ?, ?, 1)',
      [DEFAULT_ADMIN_USERNAME, passwordHash, DEFAULT_USER_CREDITS]
    );
    return;
  }

  await run(
    'UPDATE users SET password_hash = ?, is_admin = 1 WHERE id = ?',
    [passwordHash, existingAdmin.id]
  );
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

  // Backward compatibility for databases created before credits were added.
  try {
    await run(`ALTER TABLE users ADD COLUMN credits INTEGER NOT NULL DEFAULT ${DEFAULT_USER_CREDITS}`);
  } catch (error) {
    if (!String(error?.message || '').includes('duplicate column')) {
      throw error;
    }
  }

  // Backward compatibility for databases created before admin roles were added.
  try {
    await run('ALTER TABLE users ADD COLUMN is_admin INTEGER NOT NULL DEFAULT 0');
  } catch (error) {
    if (!String(error?.message || '').includes('duplicate column')) {
      throw error;
    }
  }

  await ensureDefaultAdminAccount();
}

app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use(express.json({ limit: '15mb' }));
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
  // Clear legacy cookie names from older builds to avoid session conflicts.
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
    const user = await get(
      'SELECT id, username, credits, is_admin FROM users WHERE id = ?',
      [req.session.userId]
    );
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

async function handleChargedGrokRequest(req, res, { path, payload, cost }) {
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
      response = await fetch(`https://api.x.ai${path}`, {
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
      const upstreamMessage = parsedBody?.error?.message || rawBody || `Grok request failed (${response.status}).`;
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
    response_format: typeof req.body?.response_format === 'string' ? req.body.response_format : 'b64_json'
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

app.post('/api/premium/video', requireApiAuth, async (req, res) => {
  const imageUrl = req.body?.image?.url;
  if (typeof imageUrl !== 'string' || !imageUrl.trim()) {
    res.status(400).json({ error: 'Image URL is required.' });
    return;
  }

  const payload = {
    model: typeof req.body?.model === 'string' ? req.body.model : 'grok-imagine-video',
    prompt: typeof req.body?.prompt === 'string' ? req.body.prompt : 'Animate this image into a short cinematic video.',
    duration: Number.isFinite(req.body?.duration) ? req.body.duration : 4,
    resolution: typeof req.body?.resolution === 'string' ? req.body.resolution : '480p',
    image: { url: imageUrl.trim() }
  };

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
      const upstreamMessage = parsedBody?.error?.message || rawBody || `Failed to fetch video status (${response.status}).`;
      res.status(response.status).json({ error: upstreamMessage });
      return;
    }

    res.status(200).json(parsedBody && typeof parsedBody === 'object' ? parsedBody : {});
  } catch (error) {
    console.error('Failed to fetch Grok video status:', error);
    res.status(500).json({ error: 'Failed to fetch video status.' });
  }
});

app.get(['/app', '/app/'], requireAuth, (req, res) => {
  res.sendFile(path.join(ROOT_DIR, 'index.html'));
});

app.use('/app/css', requireAuth, express.static(path.join(ROOT_DIR, 'css')));
app.use('/app/js', requireAuth, express.static(path.join(ROOT_DIR, 'js')));

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
