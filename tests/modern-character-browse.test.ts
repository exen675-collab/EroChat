import { afterEach, describe, expect, it, vi } from 'vitest';
import {
    fetchPublicCharacters,
    generateAdminCharacter,
    importPublicCharacter,
    publishGeneratedCharacter,
    publishCharacter,
    unpublishCharacter
} from '../src/client/modern/api.js';
import type { GeneratedCharacterDraft, ModernCharacter } from '../src/client/modern/types.js';

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

    it('sends the exact admin generation inputs and returns an editable draft', async () => {
        const draft: GeneratedCharacterDraft = {
            name: 'Mara',
            avatar: '🧭',
            description: 'A restless cartographer.',
            appearance: 'Ink-stained hands.',
            background: 'She maps impossible places.',
            greeting: 'You found the edge of my map.',
            systemPrompt: 'You are Mara.',
            contextMessageCount: 24
        };
        const fetchMock = vi.fn(async (...args: [RequestInfo | URL, RequestInit?]) => {
            void args;
            return new Response(JSON.stringify({ draft }), { status: 200 });
        });
        vi.stubGlobal('fetch', fetchMock);

        await expect(
            generateAdminCharacter({
                apiKey: 'sk-private',
                model: 'openai/generator',
                referenceCharacterIds: [12, 19],
                brief: 'A curious explorer'
            })
        ).resolves.toEqual(draft);

        expect(fetchMock.mock.calls[0][0]).toBe('/api/admin/characters/generate');
        const init = fetchMock.mock.calls[0][1] as RequestInit;
        expect(init.method).toBe('POST');
        expect(JSON.parse(String(init.body))).toEqual({
            apiKey: 'sk-private',
            model: 'openai/generator',
            referenceCharacterIds: [12, 19],
            brief: 'A curious explorer'
        });
    });

    it('publishes only the reviewed generated draft', async () => {
        const draft: GeneratedCharacterDraft = {
            name: 'Edited Mara',
            avatar: '🧭',
            description: '',
            appearance: 'Ink-stained hands.',
            background: 'She maps impossible places.',
            greeting: 'You found the edge of my map.',
            systemPrompt: 'You are edited Mara.',
            contextMessageCount: 18
        };
        const fetchMock = vi.fn(async (...args: [RequestInfo | URL, RequestInit?]) => {
            void args;
            return new Response(JSON.stringify({ character: publicCharacter }), { status: 201 });
        });
        vi.stubGlobal('fetch', fetchMock);

        await expect(publishGeneratedCharacter(draft)).resolves.toEqual(publicCharacter);
        expect(fetchMock.mock.calls[0][0]).toBe('/api/admin/characters/publish');
        const init = fetchMock.mock.calls[0][1] as RequestInit;
        expect(init.method).toBe('POST');
        expect(JSON.parse(String(init.body))).toEqual({ draft });
    });
});
