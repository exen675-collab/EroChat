// @vitest-environment node
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

let child: ChildProcessWithoutNullStreams;
let directory = '';
let base = '';
let cookie = '';

function request(route: string, body?: unknown, method = 'POST', auth = cookie) {
    return fetch(`${base}${route}`, {
        method,
        redirect: 'manual',
        headers: { 'Content-Type': 'application/json', Cookie: auth },
        ...(body === undefined ? {} : { body: JSON.stringify(body) })
    });
}

describe.sequential('server route composition', () => {
    beforeAll(async () => {
        directory = await mkdtemp(path.join(os.tmpdir(), 'erochat-routing-'));
        child = spawn(process.execPath, ['node_modules/tsx/dist/cli.mjs', 'src/server.ts'], {
            env: {
                ...process.env,
                PORT: '0',
                NODE_ENV: 'test',
                EROCHAT_TEST_DATA_DIR: directory,
                SESSION_SECRET: 'routing-test'
            },
            stdio: 'pipe'
        });
        base = await new Promise<string>((resolve, reject) => {
            let output = '';
            const timeout = setTimeout(() => reject(new Error(output)), 20000);
            child.stdout.on('data', (chunk) => {
                output += chunk;
                const match = output.match(/listening on http:\/\/localhost:(\d+)/);
                if (match) {
                    clearTimeout(timeout);
                    resolve(`http://127.0.0.1:${match[1]}`);
                }
            });
            child.stderr.on('data', (chunk) => {
                output += chunk;
            });
            child.once('exit', (code) => {
                clearTimeout(timeout);
                reject(new Error(`Server exited (${code}): ${output}`));
            });
        });
        const login = await request('/api/auth/login', { username: 'admin', password: 'admin' });
        expect(login.status).toBe(200);
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

    it('serves login and not-found pages and protects app files', async () => {
        const login = await request('/', undefined, 'GET', '');
        expect(login.status).toBe(200);
        expect(login.headers.get('content-type')).toContain('text/html');
        expect(login.headers.get('cache-control')).toBe('no-store');
        expect(login.headers.has('x-powered-by')).toBe(false);
        expect((await request('/', undefined, 'GET')).headers.get('location')).toBe('/app/');
        for (const route of ['/app/', '/app/media/missing.png']) {
            const response = await request(route, undefined, 'GET', '');
            expect(response.status).toBe(302);
            expect(response.headers.get('location')).toBe('/');
        }
        const apiMissing = await request('/api/missing', undefined, 'GET');
        expect(apiMissing.status).toBe(404);
        expect(await apiMissing.json()).toEqual({ error: 'Not found' });
        const pageMissing = await request('/missing', undefined, 'GET');
        expect(pageMissing.status).toBe(404);
        expect(pageMissing.headers.get('content-type')).toContain('text/html');
    });

    it('applies authentication before validation across every route group', async () => {
        const routes = [
            ['POST', '/api/media/store'],
            ['POST', '/api/media/upload'],
            ['POST', '/api/media/import-remote'],
            ['POST', '/api/characters/import-card'],
            ['GET', '/api/characters/browse'],
            ['POST', '/api/characters/publish'],
            ['POST', '/api/nanogpt/images/models'],
            ['POST', '/api/nanogpt/images'],
            ['POST', '/api/experimental/grok/chat'],
            ['GET', '/api/admin/users'],
            ['PATCH', '/api/admin/users/1/credits'],
            ['GET', '/api/generator/jobs'],
            ['GET', '/api/generator/assets']
        ];
        for (const [method, route] of routes) {
            const response = await request(route, undefined, method, '');
            expect(response.status, route).toBe(401);
            expect(await response.json()).toEqual({ error: 'Unauthorized.' });
        }
    });

    it('stores and serves media and handles multipart upload errors', async () => {
        const content = Buffer.from('stored media bytes');
        const stored = await request('/api/media/store', {
            dataUrl: `data:image/png;base64,${content.toString('base64')}`
        });
        expect(stored.status).toBe(201);
        const media = await stored.json();
        expect(media).toMatchObject({
            mimeType: 'image/png',
            mediaType: 'image',
            sizeBytes: content.length
        });
        const served = await request(media.url, undefined, 'GET');
        expect(served.status).toBe(200);
        expect(Buffer.from(await served.arrayBuffer())).toEqual(content);

        const upload = async (field: string) => {
            const form = new FormData();
            form.append(field, new Blob([content], { type: 'image/png' }), 'test.png');
            return fetch(`${base}/api/media/upload`, {
                method: 'POST',
                headers: { Cookie: cookie },
                body: form
            });
        };
        expect((await upload('file')).status).toBe(201);
        const rejected = await upload('unexpected');
        expect(rejected.status).toBe(400);
        expect(await rejected.json()).toEqual({ error: 'Unexpected field' });

        const remote = await request('/api/media/import-remote', {
            url: 'http://127.0.0.1/private.png'
        });
        expect(remote.status).toBe(400);
        expect(await remote.json()).toEqual({
            error: 'Importing media from local or private addresses is not allowed.'
        });
    });

    it('publishes, browses, imports, and removes a public character', async () => {
        const character = {
            sourceCharacterId: 'routing-test',
            name: 'Routing Test',
            systemPrompt: 'A test character.'
        };
        const published = await request('/api/characters/publish', { character });
        expect(published.status).toBe(201);
        const { character: saved } = await published.json();
        expect(saved).toMatchObject({ ...character, creator: 'admin', isOwner: true });
        expect((await request('/api/characters/publish', { character })).status).toBe(200);
        const browse = await request(
            '/api/characters/browse?q=Routing&sort=name',
            undefined,
            'GET'
        );
        expect((await browse.json()).characters).toHaveLength(1);
        const imported = await request(`/api/characters/browse/${saved.id}/import`, {});
        expect(imported.status).toBe(200);
        expect((await imported.json()).character.imports).toBe(1);
        expect(
            (await request(`/api/characters/published/${saved.id}`, undefined, 'DELETE')).status
        ).toBe(200);
        expect((await request(`/api/characters/browse/${saved.id}/import`, {})).status).toBe(404);
    });

    it('preserves admin credit updates, profile changes, and logout sessions', async () => {
        const signup = await request(
            '/api/auth/signup',
            { username: 'routing_user', password: 'password123' },
            'POST',
            ''
        );
        expect(signup.status).toBe(201);
        const userCookie = String(signup.headers.get('set-cookie')).split(';')[0];
        expect((await request('/api/admin/users', undefined, 'GET', userCookie)).status).toBe(403);
        const users = await (await request('/api/admin/users', undefined, 'GET')).json();
        const user = users.users.find((entry) => entry.username === 'routing_user');
        const credits = await request(
            `/api/admin/users/${user.id}/credits`,
            { credits: 321 },
            'PATCH'
        );
        expect(credits.status).toBe(200);
        expect((await credits.json()).user.credits).toBe(321);
        const profile = await request(
            '/api/auth/profile',
            { username: 'routing_renamed' },
            'PATCH',
            userCookie
        );
        expect(profile.status).toBe(200);
        expect((await profile.json()).user).toMatchObject({
            username: 'routing_renamed',
            credits: 321
        });
        expect((await request('/api/auth/logout', {}, 'POST', userCookie)).status).toBe(200);
        expect((await request('/api/auth/me', undefined, 'GET', userCookie)).status).toBe(401);
    });
});
