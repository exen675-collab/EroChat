import type { RequestHandler } from 'express';
import type { Database } from '../database';
import 'express-session';

declare module 'express-session' {
    interface SessionData {
        userId?: number;
        isAdmin?: boolean;
    }
}

export const requireAuth: RequestHandler = (req, res, next) => {
    if (!req.session || !req.session.userId) {
        res.redirect('/');
        return;
    }
    next();
};

export const requireApiAuth: RequestHandler = (req, res, next) => {
    if (!req.session || !req.session.userId) {
        res.status(401).json({ error: 'Unauthorized.' });
        return;
    }
    next();
};

export function createAdminMiddleware(db: Database): RequestHandler {
    const { get } = db;
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

    return requireAdmin;
}
