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
    res.redirect('/signin');
    return;
  }
  next();
}

async function initDb() {
  await run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE COLLATE NOCASE,
      password_hash TEXT NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
}

app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use(express.json());
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
  res.redirect('/signin');
});

app.get(['/login', '/signin'], (req, res) => {
  // Clear legacy cookie names from older builds to avoid session conflicts.
  res.clearCookie('erochat.sid');
  res.clearCookie('connect.sid');
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
      'INSERT INTO users (username, password_hash) VALUES (?, ?)',
      [username, passwordHash]
    );

    req.session.userId = result.lastID;
    req.session.username = username;

    res.status(201).json({ ok: true, username });
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
      'SELECT id, username, password_hash FROM users WHERE username = ? COLLATE NOCASE',
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

    res.json({ ok: true, username: user.username });
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

app.get('/api/auth/me', (req, res) => {
  if (!req.session || !req.session.userId) {
    res.status(401).json({ authenticated: false });
    return;
  }

  res.json({
    authenticated: true,
    user: {
      id: req.session.userId,
      username: req.session.username
    }
  });
});

app.get('/app', requireAuth, (req, res) => {
  res.redirect('/app/');
});

app.get('/app/', requireAuth, (req, res) => {
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
