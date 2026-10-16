import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchBootstrapUser } from '../src/client/auth.js';
import { logout } from '../src/client/modern/api.js';

describe('authenticated app bootstrap', () => {
    afterEach(() => vi.unstubAllGlobals());

    it('returns the signed-in user', async () => {
        const user = { id: 7, username: 'tester', credits: 50, isAdmin: false };
        vi.stubGlobal(
            'fetch',
            vi.fn(async () => new Response(JSON.stringify({ user }), { status: 200 }))
        );

        await expect(fetchBootstrapUser()).resolves.toEqual(user);
        expect(fetch).toHaveBeenCalledWith('/api/auth/me', { cache: 'no-store' });
    });

    it('returns null when the session cannot be loaded', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn(async () => new Response(null, { status: 401 }))
        );
        await expect(fetchBootstrapUser()).resolves.toBeNull();

        vi.stubGlobal(
            'fetch',
            vi.fn(async () => Promise.reject(new Error('offline')))
        );
        await expect(fetchBootstrapUser()).resolves.toBeNull();
    });

    it('reports a failed logout instead of treating the session as ended', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn(
                async () =>
                    new Response(JSON.stringify({ error: 'Failed to log out.' }), { status: 500 })
            )
        );

        await expect(logout()).rejects.toThrow('Could not log out');
    });
});
