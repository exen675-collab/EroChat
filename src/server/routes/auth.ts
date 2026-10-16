import type { Express } from 'express';
import { requireApiAuth } from '../middleware/auth';
import type { Database } from '../database';
import bcrypt from 'bcryptjs';
import {
    DEFAULT_USER_CREDITS,
    LOGIN_RATE_LIMIT_WINDOW_MS,
    LOGIN_RATE_LIMIT_MAX_ATTEMPTS
} from '../config';

const MAX_TRACKED_LOGIN_KEYS = 10000;

export interface SessionRevoker {
    // Ends every session for the user except the one identified by keepSessionId.
    revokeOtherSessions(userId: number, keepSessionId: string): Promise<void>;
}

export function registerAuthRoutes(app: Express, db: Database, sessions: SessionRevoker) {
    const { run, get } = db;
    const loginFailures = new Map<string, { count: number; resetAt: number }>();
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

    // Failed attempts are counted per client address and per account. The address comes from
    // req.ip, which honors the trust-proxy setting; the raw X-Forwarded-For header is never read
    // here. The per-account count still limits guessing when the address can be rotated.
    function isLoginLocked(key: string) {
        const entry = loginFailures.get(key);
        return Boolean(
            entry && Date.now() <= entry.resetAt && entry.count >= LOGIN_RATE_LIMIT_MAX_ATTEMPTS
        );
    }

    function recordLoginFailure(key: string) {
        const now = Date.now();
        const entry = loginFailures.get(key);
        if (entry && now <= entry.resetAt) {
            entry.count += 1;
            return;
        }

        if (loginFailures.size >= MAX_TRACKED_LOGIN_KEYS) {
            for (const [staleKey, stale] of loginFailures) {
                if (now > stale.resetAt) loginFailures.delete(staleKey);
            }
        }
        loginFailures.set(key, { count: 1, resetAt: now + LOGIN_RATE_LIMIT_WINDOW_MS });
    }

    function clearLoginFailures(key: string) {
        loginFailures.delete(key);
    }

    // A fresh session id on every sign-in means an id planted before login cannot be reused
    // to read the account that signs in with it.
    function startSession(req, userId: number, isAdmin: boolean): Promise<void> {
        return new Promise((resolve, reject) => {
            req.session.regenerate((regenerateError) => {
                if (regenerateError) {
                    reject(regenerateError);
                    return;
                }
                req.session.userId = userId;
                req.session.isAdmin = isAdmin;
                req.session.save((saveError) => (saveError ? reject(saveError) : resolve()));
            });
        });
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

            await startSession(req, result.lastID, false);

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
        const username = sanitizeUsername(req.body?.username);
        const password = req.body?.password;
        const addressKey = `address:${req.ip || req.socket.remoteAddress || 'unknown'}`;
        const accountKey = `account:${username.toLowerCase()}`;

        if (isLoginLocked(addressKey) || isLoginLocked(accountKey)) {
            res.status(429).json({ error: 'Too many login attempts. Try again later.' });
            return;
        }

        if (!username || typeof password !== 'string') {
            res.status(400).json({ error: 'Username and password are required.' });
            return;
        }

        const rejectLogin = () => {
            recordLoginFailure(addressKey);
            recordLoginFailure(accountKey);
            res.status(401).json({ error: 'Invalid username or password.' });
        };

        try {
            const user = await get(
                'SELECT id, username, password_hash, credits, is_admin FROM users WHERE username = ? COLLATE NOCASE',
                [username]
            );

            if (!user) {
                rejectLogin();
                return;
            }

            const ok = await bcrypt.compare(password, user.password_hash);
            if (!ok) {
                rejectLogin();
                return;
            }

            clearLoginFailures(accountKey);
            const isAdmin = Number.parseInt(user.is_admin, 10) === 1;
            await startSession(req, user.id, isAdmin);

            res.json({
                ok: true,
                username: user.username,
                credits: user.credits,
                isAdmin
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

                // The current-password check guesses a secret just like login does, so it shares
                // the account's failure count.
                const accountKey = `account:${String(user.username || '').toLowerCase()}`;
                if (isLoginLocked(accountKey)) {
                    res.status(429).json({ error: 'Too many login attempts. Try again later.' });
                    return;
                }

                const passwordOk = await bcrypt.compare(currentPassword, user.password_hash);
                if (!passwordOk) {
                    recordLoginFailure(accountKey);
                    res.status(401).json({ error: 'Current password is incorrect.' });
                    return;
                }
                clearLoginFailures(accountKey);

                updates.push('password_hash = ?');
                params.push(await bcrypt.hash(newPassword, 12));
            }

            if (updates.length > 0) {
                await run(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`, [
                    ...params,
                    userId
                ]);
            }

            // A new password must end sessions that were opened with the old one. The session making
            // this request stays signed in.
            if (newPassword) {
                await sessions.revokeOtherSessions(userId, req.sessionID);
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
