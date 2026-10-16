// @vitest-environment node
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openDatabase, type Database } from '../src/server/database';
import { settleStaleGeneratorJobs } from '../src/server/generator';
import { initDb } from '../src/server/schema';

describe('stale generator jobs', () => {
    let directory: string;
    let db: Database;

    beforeEach(async () => {
        directory = await mkdtemp(path.join(os.tmpdir(), 'wink-stale-'));
        db = openDatabase(path.join(directory, 'state.sqlite'));
        await initDb(db);
    });

    afterEach(async () => {
        await db.close();
        await rm(directory, { recursive: true, force: true });
    });

    async function job(userId: number, status: string, minutesAgo: number) {
        const result = await db.run(
            `INSERT INTO generator_jobs (user_id, batch_id, mode, provider, status, prompt, updated_at)
             VALUES (?, 'b', 'image_generate', 'swarm', ?, 'p', datetime('now', ?))`,
            [userId, status, `-${minutesAgo} minutes`]
        );
        return result.lastID;
    }
    const statusOf = async (id: number) =>
        await db.get('SELECT status, error_message FROM generator_jobs WHERE id = ?', [id]);

    it("marks only this user's long-untouched pending jobs as interrupted", async () => {
        const stale = await job(1, 'generating', 45);
        const recent = await job(1, 'generating', 5);
        const finished = await job(1, 'completed', 90);
        const otherUser = await job(2, 'queued', 90);

        await settleStaleGeneratorJobs(db, 1);

        expect(await statusOf(stale)).toEqual({
            status: 'interrupted',
            error_message: 'The page running this job closed before it finished.'
        });
        expect((await statusOf(recent)).status).toBe('generating');
        expect((await statusOf(finished)).status).toBe('completed');
        expect((await statusOf(otherUser)).status).toBe('queued');
    });
});
