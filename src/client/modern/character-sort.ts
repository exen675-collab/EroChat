import type { ModernCharacter } from './types.js';

function timestamp(value?: string): number | null {
    if (!value) return null;
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? null : parsed;
}

function lastUsedTimestamp(character: ModernCharacter): number | null {
    const stored = timestamp(character.lastUsedAt);
    if (stored !== null) return stored;

    return character.messages.reduce<number | null>((latest, message) => {
        const createdAt = timestamp(message.createdAt);
        return createdAt !== null && (latest === null || createdAt > latest) ? createdAt : latest;
    }, null);
}

export function sortCharactersByRecentUse(
    characters: readonly ModernCharacter[]
): ModernCharacter[] {
    return characters
        .map((character, index) => ({
            character,
            index,
            lastUsedAt: lastUsedTimestamp(character),
            createdAt: timestamp(character.createdAt)
        }))
        .sort((a, b) => {
            if (a.lastUsedAt !== b.lastUsedAt) {
                if (a.lastUsedAt === null) return 1;
                if (b.lastUsedAt === null) return -1;
                return b.lastUsedAt - a.lastUsedAt;
            }
            if (a.createdAt !== b.createdAt) {
                if (a.createdAt === null) return 1;
                if (b.createdAt === null) return -1;
                return b.createdAt - a.createdAt;
            }
            return b.index - a.index;
        })
        .map(({ character }) => character);
}
