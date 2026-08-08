import { afterEach, describe, expect, it, vi } from 'vitest';
import {
    fetchPublicCharacters,
    importPublicCharacter,
    publishCharacter,
    unpublishCharacter
} from '../src/client/modern/api.js';
import type { ModernCharacter } from '../src/client/modern/types.js';

const publicCharacter = {
    id: 12,
    sourceCharacterId: 'local-1',
    creator: 'author',
    creatorId: 2,
    isOwner: false,
    name: 'Seraphine',
    systemPrompt: 'Stay in character.',
    imports: 4,
    publishedAt: '2026-08-08 10:00:00',
    updatedAt: '2026-08-08 10:00:00'
};

describe('character browse API', () => {
    afterEach(() => vi.unstubAllGlobals());

    it('loads searchable, sorted community characters', async () => {
        const fetchMock = vi.fn(
            async () =>
                new Response(JSON.stringify({ characters: [publicCharacter] }), { status: 200 })
        );
        vi.stubGlobal('fetch', fetchMock);

        await expect(fetchPublicCharacters('sera', 'popular')).resolves.toEqual([publicCharacter]);
        expect(fetchMock).toHaveBeenCalledWith(
            '/api/characters/browse?sort=popular&q=sera',
            expect.objectContaining({ cache: 'no-store' })
        );
    });

    it('publishes only the shareable character profile', async () => {
        const fetchMock = vi.fn(async (...args: [RequestInfo | URL, RequestInit?]) => {
            void args;
            return new Response(JSON.stringify({ character: publicCharacter }), { status: 201 });
        });
        vi.stubGlobal('fetch', fetchMock);
        const character: ModernCharacter = {
            id: 'local-1',
            name: 'Seraphine',
            avatar: '✨',
            thumbnail: '/app/media/sera.png',
            description: 'A mysterious stranger.',
            greeting: 'Hello.',
            systemPrompt: 'Stay in character.',
            userInfo: 'private persona',
            messages: [{ id: 'secret', role: 'user', content: 'private chat' }],
            memorySnapshots: [
                { id: 'private-memory', finalText: 'private memory', createdAt: '2026-08-08' }
            ],
            openrouterSessionId: 'private-session'
        };

        await publishCharacter(character);

        const init = fetchMock.mock.calls[0][1] as RequestInit;
        const body = JSON.parse(String(init.body));
        expect(body.character).toMatchObject({
            sourceCharacterId: 'local-1',
            name: 'Seraphine',
            greeting: 'Hello.',
            systemPrompt: 'Stay in character.'
        });
        expect(body.character).not.toHaveProperty('messages');
        expect(body.character).not.toHaveProperty('memorySnapshots');
        expect(body.character).not.toHaveProperty('userInfo');
        expect(body.character).not.toHaveProperty('openrouterSessionId');
    });

    it('tracks imports and lets an owner remove a publication', async () => {
        const fetchMock = vi
            .fn()
            .mockResolvedValueOnce(
                new Response(JSON.stringify({ character: publicCharacter }), { status: 200 })
            )
            .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }));
        vi.stubGlobal('fetch', fetchMock);

        await expect(importPublicCharacter(12)).resolves.toEqual(publicCharacter);
        await expect(unpublishCharacter(12)).resolves.toBeUndefined();
        expect(fetchMock.mock.calls[0][0]).toBe('/api/characters/browse/12/import');
        expect(fetchMock.mock.calls[1][0]).toBe('/api/characters/published/12');
        expect(fetchMock.mock.calls[1][1]).toMatchObject({ method: 'DELETE' });
    });
});
