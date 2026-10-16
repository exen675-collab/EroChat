// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startServerProcess, type ServerProcess } from './helpers/server-process';

const MAX_ATTEMPTS = 20;

let server: ServerProcess;

function login(username: string, password: string, forwardedFor?: string) {
    return fetch(`${server.base}/api/auth/login`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            ...(forwardedFor ? { 'X-Forwarded-For': forwardedFor } : {})
        },
        body: JSON.stringify({ username, password })
    });
}

describe.sequential('login rate limiting', () => {
    beforeAll(async () => {
        server = await startServerProcess('wink-rate-limit-', 'rate-limit-test');
    }, 25000);

    afterAll(() => server?.stop());

    it('locks an account after repeated failures even when the client address changes', async () => {
        for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
            const response = await login(
                'ghost-account',
                'wrong-password',
                `203.0.113.${attempt + 1}`
            );
            expect(response.status).toBe(401);
        }

        const blocked = await login('ghost-account', 'wrong-password', '198.51.100.250');
        expect(blocked.status).toBe(429);
    }, 60000);

    it('locks a client address after repeated failures against different accounts', async () => {
        for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
            const response = await login(`nobody-${attempt}`, 'wrong-password');
            expect(response.status).toBe(401);
        }

        const blocked = await login('another-nobody', 'wrong-password');
        expect(blocked.status).toBe(429);
    }, 60000);
});
