// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startServerProcess, type ServerProcess } from './helpers/server-process';

let server: ServerProcess;

function post(route: string, body: unknown, cookie = '') {
    return fetch(`${server.base}${route}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie },
        body: JSON.stringify(body)
    });
}

const sessionCookie = (response: Response) =>
    String(response.headers.get('set-cookie')).split(';')[0];

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

    it('lets an administrator create accounts that can then sign in', async () => {
        const admin = sessionCookie(
            await post('/api/auth/login', { username: 'admin', password: 'admin' })
        );
        const created = await post(
            '/api/admin/users',
            { username: ' invited ', password: 'invited-pass' },
            admin
        );
        expect(created.status).toBe(201);
        expect((await created.json()).user).toMatchObject({ username: 'invited', isAdmin: false });

        expect(
            (await post('/api/admin/users', { username: 'invited', password: 'other-pass' }, admin))
                .status
        ).toBe(409);
        const invalid = await post('/api/admin/users', { username: 'x', password: 'pw' }, admin);
        expect(invalid.status).toBe(400);
        expect((await invalid.json()).error).toMatch(/Username must be/);

        const invited = await post('/api/auth/login', {
            username: 'invited',
            password: 'invited-pass'
        });
        expect(invited.status).toBe(200);
        const forbidden = await post(
            '/api/admin/users',
            { username: 'sneaky', password: 'sneaky-pass' },
            sessionCookie(invited)
        );
        expect(forbidden.status).toBe(403);
    });
});
