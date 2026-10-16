// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startServerProcess, type ServerProcess } from './helpers/server-process';

let server: ServerProcess;
let cookie = '';

function call(method: string, route: string, body?: unknown) {
    return fetch(`${server.base}${route}`, {
        method,
        headers: { 'Content-Type': 'application/json', Cookie: cookie },
        ...(body === undefined ? {} : { body: JSON.stringify(body) })
    });
}

describe.sequential('generator asset updates', () => {
    beforeAll(async () => {
        server = await startServerProcess('wink-generator-', 'generator-test');
        const signup = await fetch(`${server.base}/api/auth/signup`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: 'asset-owner', password: 'asset-pass' })
        });
        cookie = String(signup.headers.get('set-cookie')).split(';')[0];
    }, 25000);

    afterAll(() => server?.stop());

    it('stores no assets when any submitted asset is invalid', async () => {
        const created = await call('POST', '/api/generator/jobs', {
            jobs: [{ mode: 'image_generate', provider: 'openrouter', prompt: 'A harbor at dusk' }]
        });
        expect(created.status).toBe(201);
        const jobId = (await created.json()).jobs[0].id;

        const rejected = await call('PATCH', `/api/generator/jobs/${jobId}`, {
            status: 'completed',
            assets: [
                { mediaType: 'image', url: '/app/media/valid-first.png' },
                { mediaType: 'image', url: 'https://example.test/not-stored.png' }
            ]
        });
        expect(rejected.status).toBe(400);

        const assets = await (await call('GET', '/api/generator/assets')).json();
        expect(assets.assets.filter((asset) => asset.jobId === jobId)).toHaveLength(0);
    });

    it('stores every asset when all of them are valid', async () => {
        const created = await call('POST', '/api/generator/jobs', {
            jobs: [{ mode: 'image_generate', provider: 'openrouter', prompt: 'A forest path' }]
        });
        const jobId = (await created.json()).jobs[0].id;

        const accepted = await call('PATCH', `/api/generator/jobs/${jobId}`, {
            status: 'completed',
            assets: [
                { mediaType: 'image', url: '/app/media/first.png' },
                { mediaType: 'image', url: '/app/media/second.png' }
            ]
        });
        expect(accepted.status).toBe(200);

        const assets = await (await call('GET', '/api/generator/assets')).json();
        expect(assets.assets.filter((asset) => asset.jobId === jobId)).toHaveLength(2);
    });

    it("removes an asset from its owner's gallery only", async () => {
        const created = await call('POST', '/api/generator/jobs', {
            jobs: [{ mode: 'image_generate', provider: 'openrouter', prompt: 'A rooftop' }]
        });
        const jobId = (await created.json()).jobs[0].id;
        const patched = await call('PATCH', `/api/generator/jobs/${jobId}`, {
            status: 'completed',
            assets: [{ mediaType: 'image', url: '/app/media/rooftop.png' }]
        });
        const [asset] = (await patched.json()).assets;

        const stranger = await fetch(`${server.base}/api/auth/signup`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: 'asset-stranger', password: 'stranger-pass' })
        });
        const strangerCookie = String(stranger.headers.get('set-cookie')).split(';')[0];
        const foreign = await fetch(`${server.base}/api/generator/assets/${asset.id}`, {
            method: 'DELETE',
            headers: { Cookie: strangerCookie }
        });
        expect(foreign.status).toBe(404);

        expect((await call('DELETE', `/api/generator/assets/${asset.id}`)).status).toBe(200);
        expect((await call('DELETE', `/api/generator/assets/${asset.id}`)).status).toBe(404);
        expect((await call('DELETE', '/api/generator/assets/abc')).status).toBe(400);
        const assets = await (await call('GET', '/api/generator/assets')).json();
        expect(assets.assets.some((item) => item.id === asset.id)).toBe(false);
    });
});
