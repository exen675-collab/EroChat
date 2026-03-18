import { describe, expect, it } from 'vitest';

import {
    createUniqueImportedName,
    normalizeImportedCharacter
} from '../js/character-import.js';

function createCard(overrides = {}) {
    return {
        spec: 'chara_card_v2',
        spec_version: '2.0',
        data: {
            name: 'Nyx',
            description: 'A sharp-tongued rogue who teases {{user}}.',
            personality: '{{char}} is playful, bold, and observant.',
            scenario: '{{user}} meets {{char}} in a candlelit tavern.',
            first_mes: '*smiles at {{user}}* Welcome back.',
            alternate_greetings: ['Hello {{user}}', 'Good to see you, {{user}}.'],
            mes_example: '<START>\n{{char}}: Tell me your secret.',
            creator_notes: 'Keep the tone flirtatious.',
            post_history_instructions: 'Escalate slowly.',
            character_book: {
                entries: [{ keys: ['tavern'], content: 'The tavern is neutral ground.' }]
            },
            extensions: {
                depth_prompt: { prompt: 'Stay immersive.' }
            },
            ...overrides
        }
    };
}

describe('character card import normalization', () => {
    it('creates a usable imported character and preserves raw V2 metadata', () => {
        const character = normalizeImportedCharacter(
            {
                card: createCard(),
                thumbnailUrl: '/app/media/nyx.png',
                fileName: 'nyx.png'
            },
            {
                existingCharacters: [{ name: 'Nyx' }],
                currentUsername: 'adam'
            }
        );

        expect(character.name).toBe('Nyx (Imported)');
        expect(character.thumbnail).toBe('/app/media/nyx.png');
        expect(character.avatar).toBe('🤖');
        expect(character.description).toBe('A sharp-tongued rogue who teases adam.');
        expect(character.background).toContain('Personality:');
        expect(character.background).toContain('Nyx (Imported) is playful, bold, and observant.');
        expect(character.background).toContain('Escalate slowly.');
        expect(character.systemPrompt).toContain('You are roleplaying as Nyx (Imported).');
        expect(character.systemPrompt).toContain('Example Dialogue:');
        expect(character.systemPrompt).toContain('Tell me your secret.');
        expect(character.greeting).toBe('*smiles at adam* Welcome back.');
        expect(character.alternateGreetings).toEqual([
            'Hello adam',
            'Good to see you, adam.'
        ]);
        expect(character.messages).toHaveLength(1);
        expect(character.messages[0]).toMatchObject({
            role: 'assistant',
            content: '*smiles at adam* Welcome back.',
            imageUrl: null,
            videoUrl: null
        });
        expect(character.importSource).toMatchObject({
            kind: 'sillytavern_v2',
            fileName: 'nyx.png'
        });
        expect(character.sillyTavernCard.data.character_book).toEqual({
            entries: [{ keys: ['tavern'], content: 'The tavern is neutral ground.' }]
        });
        expect(character.sillyTavernCard.data.extensions).toEqual({
            depth_prompt: { prompt: 'Stay immersive.' }
        });
    });

    it('uses deterministic imported suffixes for duplicate names', () => {
        expect(
            createUniqueImportedName('Nyx', [
                { name: 'Nyx' },
                { name: 'Nyx (Imported)' },
                { name: 'Nyx (Imported 2)' }
            ])
        ).toBe('Nyx (Imported 3)');
    });

    it('rejects unsupported card specs', () => {
        expect(() =>
            normalizeImportedCharacter(
                {
                    card: {
                        spec: 'chara_card_v1',
                        spec_version: '1.0',
                        data: { name: 'Legacy' }
                    }
                },
                {
                    existingCharacters: [],
                    currentUsername: 'adam'
                }
            )
        ).toThrow('Only SillyTavern Character Card V2 files are supported.');
    });
});
