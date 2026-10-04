import type { Express } from 'express';
import { requireApiAuth } from '../middleware/auth';
import type { Database } from '../database';
import bcrypt from 'bcryptjs';
import {
    DEFAULT_USER_CREDITS,
    LOGIN_RATE_LIMIT_WINDOW_MS,
    LOGIN_RATE_LIMIT_MAX_ATTEMPTS
} from '../config';

export function registerAuthRoutes(app: Express, db: Database) {
    const { run, get } = db;
    const loginAttempts = new Map<string, { count: number; resetAt: number }>();
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
    app.post('/api/auth/signup', async (req, res) => {
        const username = sanitizeUsername(req.body?.username);
        const password = req.body?.password;

        if (!isValidUsername(username)) {
            res.status(400).json({
                error: 'Username must be 3-24 chars: letters, numbers, _ or -.'
            });
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

            res.status(201).json({
                ok: true,
                username,
                credits: DEFAULT_USER_CREDITS,
                isAdmin: false
            });
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
            res.status(400).json({
                error: 'Username must be 3-24 chars: letters, numbers, _ or -.'
            });
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
                await run(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`, [
                    ...params,
                    userId
                ]);
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
}
