// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startServerProcess, type ServerProcess } from './helpers/server-process';

const MAX_ATTEMPTS = 20;

let server: ServerProcess;

function sessionCookieFrom(response: Response) {
    return String(response.headers.get('set-cookie')).split(';')[0];
}

function post(route: string, body: unknown, cookie = '') {
    return fetch(`${server.base}${route}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie },
        body: JSON.stringify(body)
    });
}

function changePassword(cookie: string, currentPassword: string, newPassword: string) {
    return fetch(`${server.base}/api/auth/profile`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Cookie: cookie },
        body: JSON.stringify({ username: 'pw-owner', currentPassword, newPassword })
    });
}

function currentUser(cookie: string) {
    return fetch(`${server.base}/api/auth/me`, { headers: { Cookie: cookie } });
}

describe.sequential('password changes', () => {
    beforeAll(async () => {
        server = await startServerProcess('wink-password-', 'password-test');
    }, 25000);

    afterAll(() => server?.stop());

    it('signs out other sessions for the account when its password changes', async () => {
        const first = sessionCookieFrom(
            await post('/api/auth/signup', { username: 'pw-owner', password: 'first-pass' })
        );
        const second = sessionCookieFrom(
            await post('/api/auth/login', { username: 'pw-owner', password: 'first-pass' })
        );
        expect(second).not.toBe(first);

        const changed = await changePassword(first, 'first-pass', 'second-pass');
        expect(changed.status).toBe(200);

        expect((await currentUser(first)).status).toBe(200);
        expect((await currentUser(second)).status).toBe(401);
    }, 60000);

    it('limits guesses at the current password during a password change', async () => {
        const cookie = sessionCookieFrom(
            await post('/api/auth/login', { username: 'pw-owner', password: 'second-pass' })
        );

        for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
            const response = await changePassword(cookie, `wrong-${attempt}`, 'third-pass');
            expect(response.status).toBe(401);
        }

        const blocked = await changePassword(cookie, 'second-pass', 'third-pass');
        expect(blocked.status).toBe(429);
    }, 120000);
});
