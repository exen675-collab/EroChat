// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startServerProcess, type ServerProcess } from './helpers/server-process';

let server: ServerProcess;

function post(route: string, body: unknown) {
    return fetch(`${server.base}${route}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    });
}

describe.sequential('closed account creation', () => {
    beforeAll(async () => {
        server = await startServerProcess('wink-signup-', 'signup-test', {
            ALLOW_SIGNUP: 'false'
        });
    }, 25000);

    afterAll(() => server?.stop());

    it('refuses new accounts but still lets existing ones sign in', async () => {
        const options = await (await fetch(`${server.base}/api/auth/options`)).json();
        expect(options).toEqual({ signupEnabled: false });

        const signup = await post('/api/auth/signup', {
            username: 'newcomer',
            password: 'secret1'
        });
        expect(signup.status).toBe(403);
        expect((await signup.json()).error).toMatch(/turned off/);
        expect(signup.headers.has('set-cookie')).toBe(false);

        const login = await post('/api/auth/login', { username: 'newcomer', password: 'secret1' });
        expect(login.status).toBe(401);
        const admin = await post('/api/auth/login', { username: 'admin', password: 'admin' });
        expect(admin.status).toBe(200);
    });
});
