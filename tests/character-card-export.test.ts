// @vitest-environment node
import { Buffer } from 'node:buffer';
import { describe, expect, it } from 'vitest';
import { parseCharacterCardImportFile } from '../src/character-card-import';
import {
    buildCharacterCard,
    characterCardFileName,
    readWinkCardExtension
} from '../src/client/modern/character-card-export';
import type { ModernCharacter } from '../src/client/modern/types';

const character: ModernCharacter = {
    id: 'nova',
    name: 'Nova Vale',
    avatar: '🌙',
    description: 'A night courier.',
    appearance: 'Silver jacket.',
    background: 'Runs messages across the old city.',
    greeting: 'Got a delivery for me?',
    userInfo: 'private persona',
    systemPrompt: 'You are Nova.',
    contextMessageCount: 32,
    messages: [{ id: 'm1', role: 'user', content: 'a private line' }],
    memorySnapshots: [{ id: 's1', finalText: 'a private memory', createdAt: '2026' }],
    openrouterSessionId: 'private-session'
};

describe('character card export', () => {
    it('writes a V2 card the importer accepts, with standard fields filled in', () => {
        const card = buildCharacterCard(character, 'tester');
        const parsed = parseCharacterCardImportFile({
            originalname: characterCardFileName(character),
            mimetype: 'application/json',
            buffer: Buffer.from(JSON.stringify(card))
        });

        expect(parsed.card.data).toMatchObject({
            name: 'Nova Vale',
            description: 'A night courier.\n\nAppearance:\nSilver jacket.',
            scenario: 'Runs messages across the old city.',
            first_mes: 'Got a delivery for me?',
            system_prompt: 'You are Nova.',
            creator: 'tester'
        });
        expect(readWinkCardExtension(parsed.card.data)).toEqual({
            avatar: '🌙',
            description: 'A night courier.',
            appearance: 'Silver jacket.',
            background: 'Runs messages across the old city.',
            greeting: 'Got a delivery for me?',
            systemPrompt: 'You are Nova.',
            contextMessageCount: 32
        });
    });

    it('leaves out the conversation, memories, persona, and session', () => {
        const text = JSON.stringify(buildCharacterCard(character, 'tester'));
        for (const secret of [
            'a private line',
            'a private memory',
            'private persona',
            'private-session'
        ]) {
            expect(text).not.toContain(secret);
        }
    });

    it('names the file after the character', () => {
        expect(characterCardFileName(character)).toBe('nova-vale.card.json');
        expect(characterCardFileName({ ...character, name: '✨✨' })).toBe('character.card.json');
    });

    it('ignores cards without a Wink profile', () => {
        expect(readWinkCardExtension({ name: 'Other', extensions: {} })).toBeNull();
    });

    it('exports alternate greetings in the standard field', () => {
        const card = buildCharacterCard(
            { ...character, alternateGreetings: ['Back again?'] },
            'tester'
        );
        expect(card.data.alternate_greetings).toEqual(['Back again?']);
        expect(buildCharacterCard(character, 'tester').data.alternate_greetings).toEqual([]);
    });
});
