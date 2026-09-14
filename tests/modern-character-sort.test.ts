import { describe, expect, it } from 'vitest';
import { sortCharactersByRecentUse } from '../src/client/modern/character-sort.js';
import type { ModernCharacter } from '../src/client/modern/types.js';

function character(id: string, fields: Partial<ModernCharacter> = {}): ModernCharacter {
    return {
        id,
        name: id,
        systemPrompt: '',
        messages: [],
        ...fields
    };
}

describe('sortCharactersByRecentUse', () => {
    it('sorts used characters first by most recent use, then unused characters by newest', () => {
        const characters = [
            character('older-unused', { createdAt: '2026-01-01T00:00:00.000Z' }),
            character('recently-used', {
                createdAt: '2026-03-01T00:00:00.000Z',
                lastUsedAt: '2026-04-01T00:00:00.000Z'
            }),
            character('newer-unused', { createdAt: '2026-03-15T00:00:00.000Z' }),
            character('most-recently-used', {
                createdAt: '2026-02-01T00:00:00.000Z',
                lastUsedAt: '2026-05-01T00:00:00.000Z'
            })
        ];

        expect(sortCharactersByRecentUse(characters).map(({ id }) => id)).toEqual([
            'most-recently-used',
            'recently-used',
            'newer-unused',
            'older-unused'
        ]);
        expect(characters.map(({ id }) => id)).toEqual([
            'older-unused',
            'recently-used',
            'newer-unused',
            'most-recently-used'
        ]);
    });

    it('uses message timestamps and insertion order for legacy characters', () => {
        const characters = [
            character('older-message', {
                messages: [
                    {
                        id: 'one',
                        role: 'user',
                        content: 'Hello',
                        createdAt: '2026-02-01T00:00:00.000Z'
                    }
                ]
            }),
            character('older-unused'),
            character('newer-unused'),
            character('newer-message', {
                messages: [
                    {
                        id: 'two',
                        role: 'assistant',
                        content: 'Hi',
                        createdAt: '2026-03-01T00:00:00.000Z'
                    }
                ]
            })
        ];

        expect(sortCharactersByRecentUse(characters).map(({ id }) => id)).toEqual([
            'newer-message',
            'older-message',
            'newer-unused',
            'older-unused'
        ]);
    });
});
