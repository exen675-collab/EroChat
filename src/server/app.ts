import path from 'node:path';
import express from 'express';
import session from 'express-session';
import SQLiteStoreFactory from 'connect-sqlite3';
import multer from 'multer';
import { registerUserState } from '../user-state';
import {
    ROOT_DIR,
    DATA_DIR,
    MEDIA_DIR,
    MAX_JSON_BODY_BYTES,
    SESSION_SECRET,
    COOKIE_SECURE
} from './config';
import { openDatabase, type Database } from './database';
import { requireAuth, requireApiAuth } from './middleware/auth';
import { registerAuthRoutes } from './routes/auth';
import { registerMediaRoutes } from './routes/media';
import { registerCharacterRoutes } from './routes/characters';
import { registerProviderRoutes } from './routes/providers';
import { registerAdminCharacterRoutes } from './routes/admin-characters';
import { registerAdminUserRoutes } from './routes/admin-users';
import { registerGeneratorJobRoutes } from './routes/generator-jobs';
import { registerGeneratorAssetRoutes } from './routes/generator-assets';

export function createApp(db: Database) {
    const app = express();
    const SQLiteStore = SQLiteStoreFactory(session);
    // Second connection to the session store, used to end a user's other sessions. The store itself
    // creates the table, which exists before any request runs.
    const sessionsDb = openDatabase(path.join(DATA_DIR, 'sessions.sqlite'));
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
            // connect-sqlite3 declares the legacy Connect Store interface.
            store: new SQLiteStore({
                db: 'sessions.sqlite',
                dir: DATA_DIR
            }) as unknown as session.Store,
            cookie: {
                httpOnly: true,
                sameSite: 'lax',
                secure: COOKIE_SECURE,
                maxAge: 14 * 24 * 60 * 60 * 1000
            }
        })
    );

    registerUserState(app, requireApiAuth, db);
    app.get('/', (req, res) => {
        if (req.session?.userId) {
            res.redirect('/app/');
            return;
        }

        res.sendFile(path.join(ROOT_DIR, 'login.html'));
    });

    registerAuthRoutes(app, db, {
        revokeOtherSessions: (userId, keepSessionId) =>
            sessionsDb
                .run("DELETE FROM sessions WHERE sid <> ? AND json_extract(sess, '$.userId') = ?", [
                    keepSessionId,
                    userId
                ])
                .then(() => undefined)
    });
    registerMediaRoutes(app);
    registerCharacterRoutes(app, db);
    registerProviderRoutes(app);
    registerAdminCharacterRoutes(app, db);
    registerAdminUserRoutes(app, db);
    registerGeneratorJobRoutes(app, db);
    registerGeneratorAssetRoutes(app, db);

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

    // API clients read every response as JSON. Body parser failures (malformed or oversized JSON)
    // and unexpected errors would otherwise get Express's HTML page, which includes a stack trace
    // outside production.
    app.use((error, req, res, next) => {
        if (!req.path.startsWith('/api/') || res.headersSent) {
            next(error);
            return;
        }
        if (error?.type === 'entity.too.large') {
            res.status(413).json({ error: 'The request is too large.' });
            return;
        }
        if (error?.type === 'entity.parse.failed') {
            res.status(400).json({ error: 'The request body is not valid JSON.' });
            return;
        }
        console.error('Unhandled API error:', error);
        const status = Number(error?.status || error?.statusCode);
        res.status(status >= 400 && status < 600 ? status : 500).json({
            error: 'The request could not be completed.'
        });
    });

    app.use((req, res) => {
        if (req.path.startsWith('/api/')) {
            res.status(404).json({ error: 'Not found' });
            return;
        }

        res.status(404).sendFile(path.join(ROOT_DIR, 'public', '404.html'));
    });

    return app;
}
