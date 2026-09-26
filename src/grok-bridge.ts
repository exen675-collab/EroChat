import { createServer } from 'node:http';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { GrokProviderError, runGrokChat } from './grok-provider';

export function createGrokBridge(token: string, run = runGrokChat) {
    if (token.length < 32)
        throw new Error('Grok bridge token must contain at least 32 characters.');
    const expected = Buffer.from(`Bearer ${token}`);
    return createServer(async (req, res) => {
        const reply = (status: number, payload: unknown) => {
            if (!res.destroyed) {
                res.writeHead(status, {
                    'Content-Type': 'application/json',
                    'Cache-Control': 'no-store'
                });
                res.end(JSON.stringify(payload));
            }
        };
        const supplied = Buffer.from(req.headers.authorization || '');
        if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
            reply(401, { error: 'Grok bridge authentication failed.' });
            req.resume();
            return;
        }
        if (req.method === 'GET' && req.url === '/health') {
            reply(200, { service: 'erochat-grok-bridge' });
            return;
        }
        if (req.method !== 'POST' || req.url !== '/chat') {
            reply(404, { error: 'Not found.' });
            req.resume();
            return;
        }
        const abort = new AbortController();
        res.on('close', () => {
            if (!res.writableEnded) abort.abort();
        });
        try {
            const chunks: Buffer[] = [];
            let size = 0;
            for await (const chunk of req) {
                size += chunk.length;
                if (size > 600 * 1024) {
                    reply(413, { error: 'Grok bridge request is too large.' });
                    return;
                }
                chunks.push(chunk);
            }
            let body: unknown;
            try {
                body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
            } catch {
                throw new GrokProviderError('Invalid JSON request.', 400);
            }
            reply(200, { content: await run(body, abort.signal) });
        } catch (error) {
            reply(error instanceof GrokProviderError ? error.status : 502, {
                error:
                    error instanceof GrokProviderError
                        ? error.message
                        : 'Grok host bridge request failed.'
            });
        }
    });
}

export async function isGrokBridgeRunning(
    host: string,
    port: number,
    token: string
): Promise<boolean> {
    const address =
        host === '0.0.0.0'
            ? '127.0.0.1'
            : host === '::'
              ? '[::1]'
              : host.includes(':')
                ? `[${host}]`
                : host;
    try {
        const response = await fetch(`http://${address}:${port}/health`, {
            headers: { Authorization: `Bearer ${token}` },
            signal: AbortSignal.timeout(2000),
            redirect: 'error'
        });
        if (!response.ok) return false;
        const payload = (await response.json()) as { service?: string };
        return payload.service === 'erochat-grok-bridge';
    } catch {
        return false;
    }
}

if (require.main === module) {
    const port = Number(process.env.EROCHAT_GROK_BRIDGE_PORT || 20123);
    if (!Number.isInteger(port) || port < 1 || port > 65535)
        throw new Error('Invalid bridge port.');
    const envFile = resolve(__dirname, '..', '.grok-bridge.env');
    let token = process.env.EROCHAT_GROK_BRIDGE_TOKEN || '';
    if (!token) {
        try {
            token =
                readFileSync(envFile, 'utf8').match(
                    /^EROCHAT_GROK_BRIDGE_TOKEN=([a-f0-9]{64})$/m
                )?.[1] || '';
            if (!token) throw new Error('Invalid .grok-bridge.env token.');
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
            token = randomBytes(32).toString('hex');
            writeFileSync(
                envFile,
                `EROCHAT_GROK_BRIDGE_URL=http://host.docker.internal:${port}\nEROCHAT_GROK_BRIDGE_TOKEN=${token}\n`,
                { mode: 0o600, flag: 'wx' }
            );
        }
    }
    const server = createGrokBridge(token);
    server.requestTimeout = 140_000;
    const host = process.env.EROCHAT_GROK_BRIDGE_HOST || '0.0.0.0';
    server.on('error', async (error: NodeJS.ErrnoException) => {
        if (error.code === 'EADDRINUSE') {
            if (await isGrokBridgeRunning(host, port, token)) {
                console.log(
                    `Grok host bridge is already running on port ${port}. You can use EroChat; no second instance is needed.`
                );
                return;
            }
            console.error(
                `Port ${port} is already in use by another process or a bridge with different credentials. Stop that process before starting this bridge.`
            );
        } else {
            console.error(`Could not start the Grok host bridge: ${error.message}`);
        }
        process.exitCode = 1;
    });
    server.listen(port, host, () => {
        console.log(`Grok host bridge listening on port ${port}. Keep this process running.`);
        console.log('Start Docker with: docker compose --env-file .grok-bridge.env up -d --build');
    });
    for (const signal of ['SIGINT', 'SIGTERM'] as const) {
        process.on(signal, () => {
            server.close();
            server.closeAllConnections();
        });
    }
}
