import type {} from 'express-session';
import type { Express, RequestHandler } from 'express';
import { createHash } from 'node:crypto';

type Database = {
    run: (sql: string, params?: any[]) => Promise<any>;
    get: (sql: string, params?: any[]) => Promise<any>;
    all: (sql: string, params?: any[]) => Promise<any[]>;
};

// Existing database values win conflicts; missing local records are recovered.
// The exact local payload is also retained in user_state_imports for recovery.
export function mergeImportedState(local: any, saved: any): any {
    if (Array.isArray(local) && Array.isArray(saved)) {
        const result = [...saved];
        for (const item of local) {
            const index = result.findIndex((other) =>
                item?.id != null && other?.id != null
                    ? String(item.id) === String(other.id)
                    : JSON.stringify(item) === JSON.stringify(other)
            );
            if (index < 0) result.push(item);
            else result[index] = mergeImportedState(item, result[index]);
        }
        return result;
    }
    if (
        local &&
        saved &&
        typeof local === 'object' &&
        typeof saved === 'object' &&
        !Array.isArray(local) &&
        !Array.isArray(saved)
    ) {
        return Object.fromEntries(
            [...new Set([...Object.keys(local), ...Object.keys(saved)])].map((key) => [
                key,
                key in saved ? mergeImportedState(local[key], saved[key]) : local[key]
            ])
        );
    }
    return saved === undefined ? local : saved;
}

export async function initUserState(db: Database) {
    await db.run(`CREATE TABLE IF NOT EXISTS user_app_state (
        user_id INTEGER PRIMARY KEY REFERENCES users(id),
        state_json TEXT NOT NULL,
        revision INTEGER NOT NULL,
        imports_json TEXT NOT NULL DEFAULT '[]'
    )`);
    await db.run(`CREATE TABLE IF NOT EXISTS user_state_imports (
        user_id INTEGER NOT NULL REFERENCES users(id),
        digest TEXT NOT NULL,
        raw_json TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (user_id, digest)
    )`);
}

export function registerUserState(app: Express, auth: RequestHandler, db: Database) {
    app.use('/api/user-state', auth, (_req, res, next) => {
        res.set('Cache-Control', 'no-store');
        next();
    });
    app.get('/api/user-state/backups', async (req, res) => {
        try {
            res.json({
                backups: await db.all(
                    'SELECT digest, raw_json, created_at FROM user_state_imports WHERE user_id = ?',
                    [(req.session as any).userId]
                )
            });
        } catch {
            res.status(500).json({ error: 'Could not read migration backups.' });
        }
    });
    app.post('/api/user-state/load', async (req, res) => {
        try {
            const userId = (req.session as any).userId;
            const raw = req.body?.localState;
            let local: any;
            let digest: string | undefined;
            if (raw != null) {
                if (typeof raw !== 'string') {
                    res.status(400).json({ error: 'Invalid local data.' });
                    return;
                }
                // Back up even malformed data before attempting to interpret it.
                digest = createHash('sha256').update(raw).digest('hex');
                await db.run(
                    'INSERT OR IGNORE INTO user_state_imports (user_id, digest, raw_json) VALUES (?, ?, ?)',
                    [userId, digest, raw]
                );
                try {
                    local = JSON.parse(raw);
                } catch {
                    /* preserved above */
                }
                if (!local || typeof local !== 'object' || Array.isArray(local)) {
                    res.status(422).json({
                        error: 'Local data could not be read. Its original contents are preserved locally and backed up in the database.'
                    });
                    return;
                }
            }
            for (let attempt = 0; attempt < 10; attempt++) {
                const row = await db.get('SELECT * FROM user_app_state WHERE user_id = ?', [
                    userId
                ]);
                const imports: string[] = row ? JSON.parse(row.imports_json) : [];
                if (!digest || imports.includes(digest)) {
                    res.json({
                        state: row ? JSON.parse(row.state_json) : null,
                        revision: row?.revision || 0
                    });
                    return;
                }
                const state = row ? mergeImportedState(local, JSON.parse(row.state_json)) : local;
                const revision = (row?.revision || 0) + 1;
                const result = row
                    ? await db.run(
                          'UPDATE user_app_state SET state_json = ?, revision = ?, imports_json = ? WHERE user_id = ? AND revision = ?',
                          [
                              JSON.stringify(state),
                              revision,
                              JSON.stringify([...imports, digest]),
                              userId,
                              row.revision
                          ]
                      )
                    : await db.run(
                          'INSERT OR IGNORE INTO user_app_state (user_id, state_json, revision, imports_json) VALUES (?, ?, ?, ?)',
                          [userId, JSON.stringify(state), revision, JSON.stringify([digest])]
                      );
                if (result.changes) {
                    res.json({ state, revision });
                    return;
                }
            }
            res.status(409).json({ error: 'Data changed during migration. Please retry.' });
        } catch {
            res.status(500).json({
                error: 'Could not load or migrate user data. Local data has not been removed.'
            });
        }
    });
    app.put('/api/user-state', async (req, res) => {
        const { state, revision } = req.body || {};
        if (
            !state ||
            typeof state !== 'object' ||
            !Array.isArray(state.characters) ||
            !state.settings ||
            !Number.isSafeInteger(revision) ||
            revision < 0
        ) {
            res.status(400).json({ error: 'Invalid user state.' });
            return;
        }
        try {
            const userId = (req.session as any).userId;
            const result =
                revision === 0
                    ? await db.run(
                          'INSERT OR IGNORE INTO user_app_state (user_id, state_json, revision) VALUES (?, ?, 1)',
                          [userId, JSON.stringify(state)]
                      )
                    : await db.run(
                          'UPDATE user_app_state SET state_json = ?, revision = revision + 1 WHERE user_id = ? AND revision = ?',
                          [JSON.stringify(state), userId, revision]
                      );
            if (!result.changes) {
                res.status(409).json({
                    error: 'Another tab or device changed your data. Download your unsaved data before reloading.'
                });
                return;
            }
            res.json({ revision: revision + 1 });
        } catch {
            res.status(500).json({ error: 'Database save failed. Keep this page open and retry.' });
        }
    });
}
