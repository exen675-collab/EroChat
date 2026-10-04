import { limitedText, normalizePositiveInt } from './utils';
import { ADMIN_CHARACTER_REFERENCE_LIMIT } from './config';

export const PUBLIC_CHARACTER_SORTS = new Set(['newest', 'popular', 'name']);

export function normalizePublicCharacterPayload(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;

    const sourceCharacterId = limitedText(value.sourceCharacterId, 128, true);
    const name = limitedText(value.name, 100, true);
    const systemPrompt = limitedText(value.systemPrompt, 24000, true);
    if (!sourceCharacterId || !name || !systemPrompt) return null;

    const thumbnail = limitedText(value.thumbnail, 2048);
    return {
        sourceCharacterId,
        name,
        avatar: limitedText(value.avatar, 16) || '✨',
        thumbnail: thumbnail && thumbnail.startsWith('/app/media/') ? thumbnail : '',
        description: limitedText(value.description, 4000),
        appearance: limitedText(value.appearance, 4000),
        background: limitedText(value.background, 12000),
        greeting: limitedText(value.greeting, 8000),
        systemPrompt,
        contextMessageCount: normalizePositiveInt(value.contextMessageCount, 20, 1, 200)
    };
}

export function mapPublicCharacterRow(row, currentUserId) {
    if (!row) return null;
    return {
        id: row.id,
        sourceCharacterId: row.source_character_id,
        creator: row.creator_username,
        creatorId: row.user_id,
        isOwner: Number(row.user_id) === Number(currentUserId),
        name: row.name,
        avatar: row.avatar || '✨',
        thumbnail: row.thumbnail || '',
        description: row.description || '',
        appearance: row.appearance || '',
        background: row.background || '',
        greeting: row.greeting || '',
        systemPrompt: row.system_prompt,
        contextMessageCount: Number(row.context_message_count) || 20,
        imports: Number(row.import_count) || 0,
        publishedAt: row.published_at,
        updatedAt: row.updated_at
    };
}

export function normalizeAdminCharacterReferenceIds(value) {
    if (!Array.isArray(value) || value.length > ADMIN_CHARACTER_REFERENCE_LIMIT) {
        return null;
    }

    const ids = [];
    const seen = new Set();
    for (const item of value) {
        const id = Number(item);
        if (!Number.isInteger(id) || id <= 0 || id > Number.MAX_SAFE_INTEGER) {
            return null;
        }
        if (!seen.has(id)) {
            seen.add(id);
            ids.push(id);
        }
    }
    return ids;
}

export function mapCharacterGenerationReference(row) {
    return {
        name: row.name || '',
        avatar: row.avatar || '✨',
        description: row.description || '',
        appearance: row.appearance || '',
        background: row.background || '',
        greeting: row.greeting || '',
        systemPrompt: row.system_prompt || '',
        contextMessageCount: Number(row.context_message_count) || 20
    };
}
