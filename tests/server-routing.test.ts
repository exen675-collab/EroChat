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
            error: 'Requests to local or private network addresses are not allowed.'
        });

        const proxied = await request('/api/nanogpt/images/models', {
            baseUrl: 'http://[::ffff:127.0.0.1]:9',
            apiKey: 'not-a-real-key'
        });
        expect(proxied.status).toBe(400);
        expect(await proxied.json()).toEqual({
            error: 'Requests to local or private network addresses are not allowed.'
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
        for (const wildcard of ['%', '_', 'Routing_Test']) {
            const literal = await request(
                `/api/characters/browse?q=${encodeURIComponent(wildcard)}`,
                undefined,
                'GET'
            );
            expect((await literal.json()).characters).toHaveLength(0);
        }
        const ownImport = await request(`/api/characters/browse/${saved.id}/import`, {});
        expect(ownImport.status).toBe(200);
        expect((await ownImport.json()).character.imports).toBe(0);

        const importer = await request(
            '/api/auth/signup',
            { username: 'importer_one', password: 'password123' },
            'POST',
            ''
        );
        const importerCookie = String(importer.headers.get('set-cookie')).split(';')[0];
        const imported = await request(
            `/api/characters/browse/${saved.id}/import`,
            {},
            'POST',
            importerCookie
        );
        expect(imported.status).toBe(200);
        expect((await imported.json()).character.imports).toBe(1);
        const repeated = await request(
            `/api/characters/browse/${saved.id}/import`,
            {},
            'POST',
            importerCookie
        );
        expect((await repeated.json()).character.imports).toBe(1);
        expect(
            (await request(`/api/characters/published/${saved.id}`, undefined, 'DELETE')).status
        ).toBe(200);
        expect((await request(`/api/characters/browse/${saved.id}/import`, {})).status).toBe(404);
    });

    it('pages through the public catalog without repeats or gaps', async () => {
        for (let index = 0; index < 62; index += 1) {
            const character = {
                sourceCharacterId: `paged-${index}`,
                // Equal names exercise the tiebreak that keeps pages stable.
                name: `Paged ${index < 30 ? 'Twin' : index}`,
                systemPrompt: 'A paged character.'
            };
            expect((await request('/api/characters/publish', { character })).status).toBe(201);
        }
        const page = async (offset: number) =>
            (
                await request(
                    `/api/characters/browse?q=Paged&sort=name&offset=${offset}`,
                    undefined,
                    'GET'
                )
            ).json();

        const first = await page(0);
        expect(first.characters).toHaveLength(60);
        expect(first.hasMore).toBe(true);
        const second = await page(60);
        expect(second.characters).toHaveLength(2);
        expect(second.hasMore).toBe(false);
        const ids = [...first.characters, ...second.characters].map((item) => item.id);
        expect(new Set(ids).size).toBe(62);
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

    it('rejects credit values that are not whole numbers', async () => {
        const users = await (await request('/api/admin/users', undefined, 'GET')).json();
        const target = users.users.find((entry) => entry.username === 'routing_renamed');
        for (const credits of [null, true, '250', '', 1.5]) {
            const response = await request(
                `/api/admin/users/${target.id}/credits`,
                { credits },
                'PATCH'
            );
            expect(response.status, JSON.stringify(credits)).toBe(400);
        }
        expect(
            (await request('/api/admin/users/not-a-number/credits', { credits: 5 }, 'PATCH')).status
        ).toBe(400);

        const unchanged = await (await request('/api/admin/users', undefined, 'GET')).json();
        expect(unchanged.users.find((entry) => entry.id === target.id).credits).toBe(321);
    });

    it("lets an administrator remove another user's publication", async () => {
        const author = await request(
            '/api/auth/signup',
            { username: 'moderated_author', password: 'password123' },
            'POST',
            ''
        );
        const authorCookie = String(author.headers.get('set-cookie')).split(';')[0];
        const published = await request(
            '/api/characters/publish',
            {
                character: {
                    sourceCharacterId: 'moderated',
                    name: 'Moderated',
                    systemPrompt: 'Hi.'
                }
            },
            'POST',
            authorCookie
        );
        expect(published.status).toBe(201);
        const { character } = await published.json();

        const denied = await request(
            `/api/admin/public-characters/${character.id}`,
            undefined,
            'DELETE',
            authorCookie
        );
        expect(denied.status).toBe(403);

        const browseFor = async () =>
            (
                await (
                    await request('/api/characters/browse?q=Moderated&sort=name', undefined, 'GET')
                ).json()
            ).characters;
        expect(await browseFor()).toContainEqual(expect.objectContaining({ id: character.id }));

        const removed = await request(
            `/api/admin/public-characters/${character.id}`,
            undefined,
            'DELETE'
        );
        expect(removed.status).toBe(200);
        expect(await browseFor()).not.toContainEqual(expect.objectContaining({ id: character.id }));
    });
});
