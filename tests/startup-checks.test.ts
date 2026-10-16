// @vitest-environment node
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import bcrypt from 'bcryptjs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openDatabase, type Database } from '../src/server/database';
import { initDb } from '../src/server/schema';
import { findInsecureDefaults } from '../src/server/startup-checks';

describe('startup security checks', () => {
    let directory: string;
    let db: Database;

    beforeEach(async () => {
        directory = await mkdtemp(path.join(os.tmpdir(), 'wink-startup-'));
        db = openDatabase(path.join(directory, 'state.sqlite'));
        await initDb(db);
    });

    afterEach(async () => {
        await db.close();
        await rm(directory, { recursive: true, force: true });
    });

    it('warns about the default admin password and a missing session secret', async () => {
        const warnings = await findInsecureDefaults(db, undefined);
        expect(warnings).toHaveLength(2);
        expect(warnings[0]).toMatch(/SESSION_SECRET is not set/);
        expect(warnings[1]).toMatch(/"admin" account still uses its default password/);
    });

    it('stays quiet once both defaults are replaced', async () => {
        await db.run('UPDATE users SET password_hash = ? WHERE username = ?', [
            await bcrypt.hash('a-real-passphrase', 4),
            'admin'
        ]);
        expect(await findInsecureDefaults(db, 'configured-secret')).toEqual([]);
    });
});
