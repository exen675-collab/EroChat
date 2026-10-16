// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startServerProcess, type ServerProcess } from './helpers/server-process';

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

function currentUser(cookie: string) {
    return fetch(`${server.base}/api/auth/me`, { headers: { Cookie: cookie } });
}

describe.sequential('session identifiers across sign-in', () => {
    beforeAll(async () => {
        server = await startServerProcess('wink-session-', 'session-test');
    }, 25000);

    afterAll(() => server?.stop());

    it('issues a new session id on login and invalidates the one presented before', async () => {
        const planted = sessionCookieFrom(
            await post('/api/auth/signup', { username: 'session-owner', password: 'owner-pass' })
        );
        expect(planted).toContain('erochat_auth_sid=');

        const login = await post(
            '/api/auth/login',
            { username: 'admin', password: 'admin' },
            planted
        );
        expect(login.status).toBe(200);
        const issued = sessionCookieFrom(login);
        expect(issued).toContain('erochat_auth_sid=');
        expect(issued).not.toBe(planted);

        const stale = await currentUser(planted);
        expect(stale.status).toBe(401);

        const fresh = await currentUser(issued);
        expect((await fresh.json()).user.username).toBe('admin');
    });

    it('issues a new session id on signup instead of reusing the presented one', async () => {
        const existing = sessionCookieFrom(
            await post('/api/auth/login', { username: 'admin', password: 'admin' })
        );

        const signup = await post(
            '/api/auth/signup',
            { username: 'fresh-signup', password: 'fresh-pass' },
            existing
        );
        expect(signup.status).toBe(201);
        const issued = sessionCookieFrom(signup);
        expect(issued).not.toBe(existing);

        const stale = await currentUser(existing);
        expect(stale.status).toBe(401);
        expect((await currentUser(issued)).status).toBe(200);
    });
});
