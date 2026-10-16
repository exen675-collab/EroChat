// @vitest-environment node
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import bcrypt from 'bcryptjs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openDatabase, type Database } from '../src/server/database';
import { initDb } from '../src/server/schema';

describe('default admin account', () => {
    let directory: string;
    let db: Database;

    beforeEach(async () => {
        directory = await mkdtemp(path.join(os.tmpdir(), 'wink-schema-'));
        db = openDatabase(path.join(directory, 'state.sqlite'));
    });

    afterEach(async () => {
        await db.close();
        await rm(directory, { recursive: true, force: true });
    });

    it('creates the admin with the default password on first boot', async () => {
        await initDb(db);

        const admin = await db.get('SELECT password_hash, is_admin FROM users WHERE username = ?', [
            'admin'
        ]);
        expect(admin.is_admin).toBe(1);
        expect(await bcrypt.compare('admin', admin.password_hash)).toBe(true);
    });

    it('keeps a changed admin password across restarts', async () => {
        await initDb(db);
        const changedHash = await bcrypt.hash('a-new-passphrase', 4);
        await db.run('UPDATE users SET password_hash = ? WHERE username = ?', [
            changedHash,
            'admin'
        ]);

        await initDb(db);

        const admin = await db.get('SELECT password_hash FROM users WHERE username = ?', ['admin']);
        expect(admin.password_hash).toBe(changedHash);
    });

    it('restores admin privileges on boot without touching the password', async () => {
        await initDb(db);
        await db.run('UPDATE users SET is_admin = 0 WHERE username = ?', ['admin']);

        await initDb(db);

        const admin = await db.get('SELECT password_hash, is_admin FROM users WHERE username = ?', [
            'admin'
        ]);
        expect(admin.is_admin).toBe(1);
        expect(await bcrypt.compare('admin', admin.password_hash)).toBe(true);
    });
});
