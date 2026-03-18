import { state } from './state.js';
import { generateId } from './utils.js';
import { saveToLocalStorage } from './storage.js';
import { selectCharacter } from './characters.js';

const IMPORT_KIND = 'sillytavern_v2';
const DEFAULT_IMPORTED_AVATAR = '🤖';

function assertValidCard(card) {
    if (!card || typeof card !== 'object') {
        throw new Error('Imported card payload was malformed.');
    }

    if (card.spec !== 'chara_card_v2' || !card.data || typeof card.data !== 'object') {
        throw new Error('Only SillyTavern Character Card V2 files are supported.');
    }
}

function replacePlaceholders(value, { charName, userName }) {
    return String(value ?? '')
        .replace(/\{\{\s*char\s*\}\}/gi, charName)
        .replace(/\{\{\s*user\s*\}\}/gi, userName);
}

function normalizeString(value, context) {
    return replacePlaceholders(value, context).trim();
}

function normalizeStringList(value, context) {
    if (!Array.isArray(value)) return [];
    return value
        .map((entry) => normalizeString(entry, context))
        .filter((entry) => entry.length > 0);
}

function buildSection(label, value) {
    const trimmed = String(value || '').trim();
    if (!trimmed) return '';
    return `${label}:\n${trimmed}`;
}

function buildImportedBackground(data, context) {
    return [
        buildSection('Personality', normalizeString(data.personality, context)),
        buildSection('Scenario', normalizeString(data.scenario, context)),
        buildSection('Creator Notes', normalizeString(data.creator_notes, context)),
        buildSection(
            'Post-History Instructions',
            normalizeString(data.post_history_instructions, context)
        )
    ]
        .filter(Boolean)
        .join('\n\n');
}

function buildImportedSystemPrompt(data, context) {
    const sections = [
        `You are roleplaying as ${context.charName}. Stay in character and respond naturally.`,
        buildSection('Character Name', context.charName),
        buildSection('User', context.userName),
        buildSection('Description', normalizeString(data.description, context)),
        buildSection('Personality', normalizeString(data.personality, context)),
        buildSection('Scenario', normalizeString(data.scenario, context)),
        buildSection('Creator Notes', normalizeString(data.creator_notes, context)),
        buildSection(
            'Post-History Instructions',
            normalizeString(data.post_history_instructions, context)
        ),
        buildSection('Example Dialogue', normalizeString(data.mes_example, context))
    ];

    return sections.filter(Boolean).join('\n\n').trim();
}

function buildSeedMessages(greeting) {
    if (!greeting) return [];

    return [
        {
            id: generateId(),
            role: 'assistant',
            content: greeting,
            imageUrl: null,
            videoUrl: null
        }
    ];
}

function getExistingNames(existingCharacters = []) {
    return new Set(
        existingCharacters
            .map((character) => String(character?.name || '').trim().toLowerCase())
            .filter(Boolean)
    );
}

export function createUniqueImportedName(baseName, existingCharacters = []) {
    const trimmedBaseName = String(baseName || '').trim() || 'Imported Character';
    const existingNames = getExistingNames(existingCharacters);
    if (!existingNames.has(trimmedBaseName.toLowerCase())) {
        return trimmedBaseName;
    }

    const firstFallback = `${trimmedBaseName} (Imported)`;
    if (!existingNames.has(firstFallback.toLowerCase())) {
        return firstFallback;
    }

    let suffix = 2;
    while (existingNames.has(`${trimmedBaseName} (Imported ${suffix})`.toLowerCase())) {
        suffix += 1;
    }

    return `${trimmedBaseName} (Imported ${suffix})`;
}

export function normalizeImportedCharacter(payload, options = {}) {
    const { card, thumbnailUrl = null, fileName = '' } = payload || {};
    assertValidCard(card);

    const rawData = card.data;
    const requestedName = String(rawData.name || '').trim() || 'Imported Character';
    const existingCharacters = options.existingCharacters || state.characters;
    const userName =
        String(options.currentUsername || state.currentUser?.username || 'User').trim() || 'User';
    const finalName = createUniqueImportedName(requestedName, existingCharacters);
    const context = {
        charName: finalName,
        userName
    };
    const greeting = normalizeString(rawData.first_mes, context);
    const alternateGreetings = normalizeStringList(rawData.alternate_greetings, context);
    const background = buildImportedBackground(rawData, context);
    const systemPrompt = buildImportedSystemPrompt(rawData, context);

    const character = {
        id: `char_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        name: finalName,
        avatar: DEFAULT_IMPORTED_AVATAR,
        systemPrompt,
        description: normalizeString(rawData.description, context),
        background,
        userInfo: '',
        appearance: '',
        greeting,
        alternateGreetings,
        importSource: {
            kind: IMPORT_KIND,
            fileName,
            importedAt: new Date().toISOString()
        },
        sillyTavernCard: {
            spec: card.spec,
            spec_version: card.spec_version,
            data: card.data
        },
        isDefault: false,
        messages: buildSeedMessages(greeting)
    };

    if (thumbnailUrl) {
        character.thumbnail = thumbnailUrl;
    }

    return character;
}

async function uploadCharacterCard(file) {
    const formData = new FormData();
    formData.append('file', file);

    const response = await fetch('/api/characters/import-card', {
        method: 'POST',
        body: formData
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
        throw new Error(payload.error || `Failed to import character card (${response.status})`);
    }

    return payload;
}

export async function importCharacterCardFile(file) {
    if (!(file instanceof File)) {
        throw new Error('Please choose a valid character card file.');
    }

    const payload = await uploadCharacterCard(file);
    const importedCharacter = normalizeImportedCharacter(payload, {
        existingCharacters: state.characters,
        currentUsername: state.currentUser?.username
    });

    state.characters.push(importedCharacter);
    selectCharacter(importedCharacter.id);
    saveToLocalStorage();

    return {
        character: importedCharacter,
        warnings: Array.isArray(payload.warnings) ? payload.warnings : []
    };
}
