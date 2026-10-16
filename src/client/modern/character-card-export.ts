import type { ModernCharacter } from './types.js';

/** The exact Wink profile, kept in the card's extensions so importing it back loses nothing. */
export interface WinkCardExtension {
    avatar: string;
    description: string;
    appearance: string;
    background: string;
    greeting: string;
    systemPrompt: string;
    contextMessageCount: number;
}

export function readWinkCardExtension(data: Record<string, any>): WinkCardExtension | null {
    const wink = data?.extensions?.wink;
    if (!wink || typeof wink !== 'object' || typeof wink.systemPrompt !== 'string') return null;
    const text = (value: unknown) => (typeof value === 'string' ? value : '');
    return {
        avatar: text(wink.avatar),
        description: text(wink.description),
        appearance: text(wink.appearance),
        background: text(wink.background),
        greeting: text(wink.greeting),
        systemPrompt: wink.systemPrompt,
        contextMessageCount: Number(wink.contextMessageCount) || 0
    };
}

/**
 * Builds a Character Card V2 for a character. Other tools read the standard fields; the profile,
 * not the conversation, memories, or user information, is exported.
 */
export function buildCharacterCard(character: ModernCharacter, creator: string) {
    const appearance = character.appearance?.trim() || '';
    const description = character.description?.trim() || '';
    const wink: WinkCardExtension = {
        avatar: character.avatar || '',
        description,
        appearance,
        background: character.background?.trim() || '',
        greeting: character.greeting?.trim() || '',
        systemPrompt: character.systemPrompt || '',
        contextMessageCount: character.contextMessageCount || 20
    };
    return {
        spec: 'chara_card_v2',
        spec_version: '2.0',
        data: {
            name: character.name,
            description: [description, appearance && `Appearance:\n${appearance}`]
                .filter(Boolean)
                .join('\n\n'),
            personality: '',
            scenario: wink.background,
            first_mes: wink.greeting,
            mes_example: '',
            creator_notes: '',
            system_prompt: wink.systemPrompt,
            post_history_instructions: '',
            alternate_greetings: [],
            tags: [],
            creator,
            character_version: '',
            extensions: { wink }
        }
    };
}

export function characterCardFileName(character: ModernCharacter): string {
    const slug = character.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
    return `${slug || 'character'}.card.json`;
}

export function downloadCharacterCard(character: ModernCharacter, creator: string) {
    const url = URL.createObjectURL(
        new Blob([JSON.stringify(buildCharacterCard(character, creator), null, 2)], {
            type: 'application/json'
        })
    );
    const link = document.createElement('a');
    link.href = url;
    link.download = characterCardFileName(character);
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
