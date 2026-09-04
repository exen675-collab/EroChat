// @vitest-environment node
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

let child: ChildProcess;
let directory = '';
let base = '';
let cookie = '';
async function request(route: string, body?: unknown, method = 'POST', auth = cookie) {
    return fetch(`${base}${route}`, {
        method,
        headers: { 'Content-Type': 'application/json', Cookie: auth },
        ...(body === undefined ? {} : { body: JSON.stringify(body) })
    });
}

describe.sequential('database user state', () => {
    beforeAll(async () => {
        directory = await mkdtemp(path.join(os.tmpdir(), 'erochat-state-'));
        child = spawn(process.execPath, ['node_modules/tsx/dist/cli.mjs', 'src/server.ts'], {
            env: {
                ...process.env,
                PORT: '0',
                NODE_ENV: 'test',
                EROCHAT_TEST_DATA_DIR: directory,
                SESSION_SECRET: 'state-test'
            },
            stdio: 'pipe'
        });
        base = await new Promise<string>((resolve, reject) => {
            let output = '';
            const timeout = setTimeout(() => reject(new Error(output)), 20000);
            child.stdout!.on('data', (chunk) => {
                output += chunk;
                const match = output.match(/listening on http:\/\/localhost:(\d+)/);
                if (match) {
                    clearTimeout(timeout);
                    resolve(`http://127.0.0.1:${match[1]}`);
                }
            });
            child.stderr!.on('data', (chunk) => {
                output += chunk;
            });
        });
        const login = await request('/api/auth/login', { username: 'admin', password: 'admin' });
        cookie = String(login.headers.get('set-cookie')).split(';')[0];
    }, 25000);
    afterAll(async () => {
        if (child?.exitCode === null) {
            const exited = new Promise<void>((resolve) => child.once('exit', () => resolve()));
            child.kill();
            await exited;
        }
        if (directory)
            await rm(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    });

    const local = {
        settings: { key: 'secret' },
        characters: [{ id: 'hero', messages: [{ id: 'm1', content: 'hello' }] }],
        galleryImages: [{ id: 'g1', imageUrl: 'data:image/png;base64,abc' }],
        extraLegacyField: { keep: true }
    };
    it('requires authentication and returns an empty state for a new account', async () => {
        expect((await request('/api/user-state/load', {}, 'POST', '')).status).toBe(401);
        expect(await (await request('/api/user-state/load', {})).json()).toEqual({
            state: null,
            revision: 0
        });
    });
    it('migrates the complete original data and preserves an exact backup', async () => {
        const raw = JSON.stringify(local, null, 2);
        expect(await (await request('/api/user-state/load', { localState: raw })).json()).toEqual({
            state: local,
            revision: 1
        });
        const backups = await (await request('/api/user-state/backups', undefined, 'GET')).json();
        expect(backups.backups[0].raw_json).toBe(raw);
    });
    it('does not resurrect deleted local records on a subsequent migration', async () => {
        const state = { ...local, characters: [], galleryImages: [] };
        expect(
            await (await request('/api/user-state', { state, revision: 1 }, 'PUT')).json()
        ).toEqual({ revision: 2 });
        expect(
            await (
                await request('/api/user-state/load', {
                    localState: JSON.stringify(local, null, 2)
                })
            ).json()
        ).toEqual({ state, revision: 2 });
        expect(
            (await request('/api/user-state', { state: local, revision: 1 }, 'PUT')).status
        ).toBe(409);
    });
    it('recovers records from another browser while retaining database preferences', async () => {
        const other = { ...local, settings: { key: 'older-key', extra: 'preserved' } };
        const result = await (
            await request('/api/user-state/load', { localState: JSON.stringify(other) })
        ).json();
        expect(result.state.characters).toEqual(local.characters);
        expect(result.state.settings).toEqual({ key: 'secret', extra: 'preserved' });
        expect(result.revision).toBe(3);
    });
    it('isolates accounts and rejects malformed data without overwriting saved state', async () => {
        expect((await request('/api/user-state/load', { localState: '{broken' })).status).toBe(422);
        expect((await (await request('/api/user-state/load', {})).json()).revision).toBe(3);
        const signup = await request('/api/auth/signup', {
            username: 'other-user',
            password: 'password123'
        });
        const otherCookie = String(signup.headers.get('set-cookie')).split(';')[0];
        expect(
            await (await request('/api/user-state/load', {}, 'POST', otherCookie)).json()
        ).toEqual({ state: null, revision: 0 });
        expect(
            await (await request('/api/user-state/backups', undefined, 'GET', otherCookie)).json()
        ).toEqual({ backups: [] });
    });
});
