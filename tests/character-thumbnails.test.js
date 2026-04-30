import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('character thumbnail fallback', () => {
    let state;
    let characters;

    beforeEach(async () => {
        vi.resetModules();

        ({ state } = await import('../js/state.js'));
        characters = await import('../js/characters.js');

        state.galleryImages = [];
    });

    it('uses an explicit character thumbnail before generated gallery images', () => {
        state.galleryImages = [
            {
                characterId: 'char-a',
                imageUrl: '/app/media/generated.png',
                createdAt: '2026-04-08T12:00:00.000Z'
            }
        ];

        expect(
            characters.getCharacterThumbnailUrl({
                id: 'char-a',
                thumbnail: '/app/media/user-set.png'
            })
        ).toBe('/app/media/user-set.png');
    });

    it('falls back to the first generated image for the character', () => {
        state.galleryImages = [
            {
                characterId: 'char-a',
                imageUrl: '/app/media/newer.png',
                createdAt: '2026-04-08T12:00:00.000Z'
            },
            {
                characterId: 'char-a',
                imageUrl: '/app/media/older.png',
                createdAt: '2026-04-07T12:00:00.000Z'
            },
            {
                characterId: 'char-b',
                imageUrl: '/app/media/other-character.png',
                createdAt: '2026-04-06T12:00:00.000Z'
            }
        ];

        expect(
            characters.getCharacterThumbnailUrl({
                id: 'char-a'
            })
        ).toBe('/app/media/older.png');
    });

    it('returns null when the character has no thumbnail or generated images', () => {
        state.galleryImages = [
            {
                characterId: 'char-b',
                imageUrl: '/app/media/other-character.png',
                createdAt: '2026-04-06T12:00:00.000Z'
            }
        ];

        expect(
            characters.getCharacterThumbnailUrl({
                id: 'char-a'
            })
        ).toBeNull();
    });
});
