// @vitest-environment node
import dns from 'node:dns/promises';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
    assertPublicHttpUrl,
    fetchPublicUrl,
    PRIVATE_ADDRESS_MESSAGE,
    readBodyWithLimit
} from '../src/server/services/remote-fetch';

const PUBLIC_ADDRESS = '93.184.216.34';

function resolvesTo(...addresses: string[]) {
    vi.spyOn(dns, 'lookup').mockResolvedValue(
        addresses.map((address) => ({ address, family: address.includes(':') ? 6 : 4 })) as any
    );
}

afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});

describe('public URL validation', () => {
    it.each([
        'http://127.0.0.1/private.png',
        'http://10.0.0.5/',
        'http://172.20.1.1/',
        'http://192.168.1.1/',
        'http://169.254.169.254/latest/meta-data/',
        'http://100.64.0.1/',
        'http://[::1]/',
        'http://[::]/',
        'http://[::ffff:127.0.0.1]/',
        'http://[::ffff:7f00:1]/',
        'http://[fd00::1]/',
        'http://[fe80::1]/',
        'http://localhost:8080/',
        'http://service.localhost/',
        'http://printer.local/'
    ])('rejects the internal address %s', async (url) => {
        await expect(assertPublicHttpUrl(url)).rejects.toThrow(PRIVATE_ADDRESS_MESSAGE);
    });

    it('rejects a public-looking name that resolves to an internal address', async () => {
        resolvesTo('10.0.0.7');

        await expect(assertPublicHttpUrl('https://images.example.com/a.png')).rejects.toThrow(
            PRIVATE_ADDRESS_MESSAGE
        );
    });

    it('rejects a name when any of its resolved addresses is internal', async () => {
        resolvesTo(PUBLIC_ADDRESS, '127.0.0.1');

        await expect(assertPublicHttpUrl('https://images.example.com/a.png')).rejects.toThrow(
            PRIVATE_ADDRESS_MESSAGE
        );
    });

    it('accepts a name that resolves only to public addresses', async () => {
        resolvesTo(PUBLIC_ADDRESS);

        const parsed = await assertPublicHttpUrl('https://images.example.com/a.png');
        expect(parsed.hostname).toBe('images.example.com');
    });

    it('rejects schemes other than http and https', async () => {
        await expect(assertPublicHttpUrl('file:///etc/passwd')).rejects.toThrow(
            'Only http or https media URLs are supported.'
        );
    });
});

describe('fetchPublicUrl', () => {
    it('does not follow a redirect into an internal address', async () => {
        resolvesTo(PUBLIC_ADDRESS);
        const fetchMock = vi.fn(
            async () =>
                new Response(null, {
                    status: 302,
                    headers: { location: 'http://127.0.0.1/secret.png' }
                })
        );
        vi.stubGlobal('fetch', fetchMock);

        await expect(
            fetchPublicUrl('https://images.example.com/a.png', {
                timeoutMs: 5000,
                followRedirects: true
            })
        ).rejects.toThrow(PRIVATE_ADDRESS_MESSAGE);
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('follows public redirects by hand and validates each hop', async () => {
        resolvesTo(PUBLIC_ADDRESS);
        const fetchMock = vi
            .fn()
            .mockResolvedValueOnce(
                new Response(null, {
                    status: 301,
                    headers: { location: 'https://cdn.example.com/b.png' }
                })
            )
            .mockResolvedValueOnce(new Response('image', { status: 200 }));
        vi.stubGlobal('fetch', fetchMock);

        const response = await fetchPublicUrl('https://images.example.com/a.png', {
            timeoutMs: 5000,
            followRedirects: true
        });

        expect(response.status).toBe(200);
        expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
            'https://images.example.com/a.png',
            'https://cdn.example.com/b.png'
        ]);
        expect(fetchMock.mock.calls.every(([, init]) => init.redirect === 'manual')).toBe(true);
    });

    it('stops following redirects after a fixed number of hops', async () => {
        resolvesTo(PUBLIC_ADDRESS);
        vi.stubGlobal(
            'fetch',
            vi.fn(
                async () =>
                    new Response(null, {
                        status: 302,
                        headers: { location: 'https://images.example.com/again.png' }
                    })
            )
        );

        await expect(
            fetchPublicUrl('https://images.example.com/a.png', {
                timeoutMs: 5000,
                followRedirects: true
            })
        ).rejects.toThrow('The remote server redirected too many times.');
    });

    it('returns a redirect unfollowed when following is disabled', async () => {
        resolvesTo(PUBLIC_ADDRESS);
        vi.stubGlobal(
            'fetch',
            vi.fn(
                async () =>
                    new Response(null, {
                        status: 307,
                        headers: { location: 'http://127.0.0.1/secret' }
                    })
            )
        );

        const response = await fetchPublicUrl('https://api.example.com/v1/models', {
            method: 'POST',
            timeoutMs: 5000
        });
        expect(response.status).toBe(307);
    });
});

describe('readBodyWithLimit', () => {
    it('returns the whole body when it fits within the limit', async () => {
        const response = new Response(new TextEncoder().encode('hello world'));

        const body = await readBodyWithLimit(response, 64);
        expect(body.toString('utf8')).toBe('hello world');
    });

    it('rejects a body that exceeds the limit', async () => {
        const response = new Response(new Uint8Array(64));

        await expect(readBodyWithLimit(response, 16)).rejects.toThrow(
            'Remote media file is too large to import.'
        );
    });
});
