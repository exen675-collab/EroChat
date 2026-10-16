import type { Express } from 'express';
import { requireApiAuth, createAdminMiddleware } from '../middleware/auth';
import type { Database } from '../database';
import { accountCredentialsError, insertAccount, sanitizeUsername } from './auth';

function mapAdminUserRow(row) {
    return {
        id: row.id,
        username: row.username,
        credits: Number.isFinite(row.credits) ? row.credits : 0,
        isAdmin: Number.parseInt(row.is_admin, 10) === 1,
        createdAt: row.created_at
    };
}

export function registerAdminUserRoutes(app: Express, db: Database) {
    const { run, get, all } = db;
    const requireAdmin = createAdminMiddleware(db);
    app.get('/api/admin/users', requireApiAuth, requireAdmin, async (req, res) => {
        try {
            const rows = await all(
                'SELECT id, username, credits, is_admin, created_at FROM users ORDER BY username COLLATE NOCASE ASC'
            );
            const users = rows.map(mapAdminUserRow);

            res.json({ users });
        } catch (error) {
            console.error('Failed to list admin users:', error);
            res.status(500).json({ error: 'Failed to load users.' });
        }
    });

    // Lets an administrator add accounts, including when public sign-up is turned off.
    app.post('/api/admin/users', requireApiAuth, requireAdmin, async (req, res) => {
        const username = sanitizeUsername(req.body?.username);
        const password = req.body?.password;
        const invalid = accountCredentialsError(username, password);
        if (invalid) {
            res.status(400).json({ error: invalid });
            return;
        }

        try {
            const userId = await insertAccount(db, username, password);
            const row = await get(
                'SELECT id, username, credits, is_admin, created_at FROM users WHERE id = ?',
                [userId]
            );
            res.status(201).json({ user: mapAdminUserRow(row) });
        } catch (error) {
            if (error && error.code === 'SQLITE_CONSTRAINT') {
                res.status(409).json({ error: 'Username is already taken.' });
                return;
            }
            console.error('Failed to create user:', error);
            res.status(500).json({ error: 'Failed to create the account.' });
        }
    });

    app.patch(
        '/api/admin/users/:userId/credits',
        requireApiAuth,
        requireAdmin,
        async (req, res) => {
            const rawUserId = String(req.params?.userId ?? '');
            const userId = /^\d+$/.test(rawUserId) ? Number(rawUserId) : 0;
            // Number() would accept null, booleans, and numeric strings, and quietly set a balance.
            const credits = typeof req.body?.credits === 'number' ? req.body.credits : Number.NaN;

            if (!Number.isSafeInteger(userId) || userId <= 0) {
                res.status(400).json({ error: 'Invalid user ID.' });
                return;
            }

            if (!Number.isInteger(credits) || credits < 0 || credits > 1000000000) {
                res.status(400).json({
                    error: 'Credits must be an integer between 0 and 1000000000.'
                });
                return;
            }

            try {
                const result = await run('UPDATE users SET credits = ? WHERE id = ?', [
                    credits,
                    userId
                ]);
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
        }
    );
}
