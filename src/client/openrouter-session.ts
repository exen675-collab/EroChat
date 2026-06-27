// @ts-nocheck
import { state } from './state.js';

const OPENROUTER_SESSION_ID_MAX_LENGTH = 256;

export function normalizeOpenRouterSessionId(value) {
    const normalized = String(value || '').trim();
    if (!normalized) return '';
    return normalized.slice(0, OPENROUTER_SESSION_ID_MAX_LENGTH);
}

function createOpenRouterSessionId(characterId = 'default') {
    const safeCharacterId =
        String(characterId || 'default')
            .trim()
            .replace(/[^a-zA-Z0-9_-]+/g, '-')
            .replace(/^-+|-+$/g, '')
            .slice(0, 80) || 'default';
    const randomPart =
        typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
            ? crypto.randomUUID()
            : `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;

    return normalizeOpenRouterSessionId(`erochat-${safeCharacterId}-${randomPart}`);
}

function getCurrentSessionCharacter() {
    const characterId = state.currentCharacterId || 'default';
    return (
        state.characters.find((character) => character?.id === characterId) ||
        state.characters.find((character) => character?.id === 'default') ||
        null
    );
}

export function getCurrentOpenRouterSessionId() {
    return normalizeOpenRouterSessionId(getCurrentSessionCharacter()?.openrouterSessionId);
}

export function ensureCurrentOpenRouterSessionId() {
    const character = getCurrentSessionCharacter();
    if (!character) {
        return createOpenRouterSessionId(state.currentCharacterId || 'default');
    }

    character.openrouterSessionId = normalizeOpenRouterSessionId(character.openrouterSessionId);
    if (!character.openrouterSessionId) {
        character.openrouterSessionId = createOpenRouterSessionId(character.id || 'default');
    }

    return character.openrouterSessionId;
}

export function resetCurrentOpenRouterSessionId() {
    const character = getCurrentSessionCharacter();
    if (character) {
        delete character.openrouterSessionId;
    }
}
