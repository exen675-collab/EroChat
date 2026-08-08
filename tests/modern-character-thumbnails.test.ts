import { describe, expect, it } from 'vitest';
import { getCharacterThumbnailUrl } from '../src/client/modern/character-thumbnails.js';
import type { GalleryItem, ModernCharacter } from '../src/client/modern/types.js';

const character: ModernCharacter = {
    id: 'char-a',
    name: 'Alicia',
    avatar: 'A',
    systemPrompt: 'Stay in character.',
    messages: []
};

describe('modern character thumbnail fallback', () => {
    it('prefers an explicit character thumbnail', () => {
        expect(
            getCharacterThumbnailUrl({ ...character, thumbnail: '/media/portrait.png' }, [
                { characterId: 'char-a', imageUrl: '/media/generated.png' }
            ] as GalleryItem[])
        ).toBe('/media/portrait.png');
    });

    it('uses the first generated gallery image when no thumbnail is set', () => {
        expect(
            getCharacterThumbnailUrl(character, [
                {
                    id: 'newer',
                    characterId: 'char-a',
                    imageUrl: '/media/newer.png',
                    createdAt: '2026-08-08T12:00:00.000Z'
                },
                {
                    id: 'other',
                    characterId: 'char-b',
                    imageUrl: '/media/other.png',
                    createdAt: '2026-08-01T12:00:00.000Z'
                },
                {
                    id: 'older',
                    characterId: 'char-a',
                    imageUrl: '/media/older.png',
                    createdAt: '2026-08-07T12:00:00.000Z'
                }
            ])
        ).toBe('/media/older.png');
    });

    it('returns null when no character image exists', () => {
        expect(getCharacterThumbnailUrl(character, [])).toBeNull();
    });
});
