// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest';
import type { Server } from 'node:http';
import { createGrokBridge, isGrokBridgeRunning } from '../src/grok-bridge.ts';
import { GrokProviderError, requestGrokChat } from '../src/grok-provider.ts';

let server: Server;
const token = 'a'.repeat(64);
const body = { messages: [{ role: 'user', content: 'Hello' }] };
async function start(run = vi.fn(async () => 'Host reply')) {
    server = createGrokBridge(token, run);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address() as { port: number };
    const url = `http://127.0.0.1:${address.port}`;
    vi.stubEnv('EROCHAT_GROK_BRIDGE_URL', url);
    vi.stubEnv('EROCHAT_GROK_BRIDGE_TOKEN', token);
    return { url, run };
}
afterEach(async () => {
    vi.unstubAllEnvs();
    if (server?.listening) {
        server.closeAllConnections();
        await new Promise<void>((resolve) => server.close(() => resolve()));
    }
});
it('routes a validated conversation to the authenticated host bridge', async () => {
    const { run } = await start();
    expect(await requestGrokChat(body)).toBe('Host reply');
    expect(run).toHaveBeenCalledWith({ ...body, model: '' }, expect.any(AbortSignal));
});
it('rejects missing and incorrect credentials without invoking Grok', async () => {
    const { url, run } = await start();
    expect((await fetch(`${url}/chat`, { method: 'POST' })).status).toBe(401);
    vi.stubEnv('EROCHAT_GROK_BRIDGE_TOKEN', 'b'.repeat(64));
    await expect(requestGrokChat(body)).rejects.toMatchObject({ status: 401 });
    expect(run).not.toHaveBeenCalled();
});
it('rejects malformed JSON and unknown routes', async () => {
    const { url, run } = await start();
    const headers = { Authorization: `Bearer ${token}` };
    expect((await fetch(`${url}/chat`, { method: 'POST', headers, body: '{' })).status).toBe(400);
    expect((await fetch(`${url}/anything`, { headers })).status).toBe(404);
    expect(run).not.toHaveBeenCalled();
});
it('preserves host busy errors instead of falling back to the container CLI', async () => {
    await start(
        vi.fn(async () => {
            throw new GrokProviderError('Grok is busy.', 429);
        })
    );
    await expect(requestGrokChat(body)).rejects.toMatchObject({
        status: 429,
        message: 'Grok is busy.'
    });
});
it('explains missing configuration and unreachable hosts', async () => {
    await start();
    vi.stubEnv('EROCHAT_GROK_BRIDGE_TOKEN', '');
    await expect(requestGrokChat(body)).rejects.toThrow('token is missing');
    vi.stubEnv('EROCHAT_GROK_BRIDGE_TOKEN', token);
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await expect(requestGrokChat(body)).rejects.toThrow('Start npm run grok:bridge');
});

it('recognizes an existing authenticated bridge without running a prompt', async () => {
    const { run } = await start();
    const { port } = server.address() as { port: number };
    expect(await isGrokBridgeRunning('0.0.0.0', port, token)).toBe(true);
    expect(await isGrokBridgeRunning('127.0.0.1', port, 'wrong-token')).toBe(false);
    expect(run).not.toHaveBeenCalled();
});
