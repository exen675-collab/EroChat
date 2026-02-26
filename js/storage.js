import { state } from './state.js';
import { defaultCharacter } from './config.js';
import { elements } from './dom.js';
import { renderCharactersList, updateCurrentCharacterUI } from './characters.js';
import { renderMessages } from './messages.js';
import { generateId } from './utils.js';

const LEGACY_STORAGE_KEY = 'erochat_data';
const USER_STORAGE_KEY_PREFIX = 'erochat_data_user_';
const LEGACY_MIGRATED_MARKER_KEY = 'erochat_data_legacy_migrated';

function getStorageKeyForCurrentUser() {
    if (state.currentUser && state.currentUser.id != null) {
        return `${USER_STORAGE_KEY_PREFIX}${state.currentUser.id}`;
    }
    return LEGACY_STORAGE_KEY;
}

function readStoredData() {
    const userStorageKey = getStorageKeyForCurrentUser();
    let data = localStorage.getItem(userStorageKey);
    if (data) {
        return data;
    }

    // One-time migration from pre-user storage.
    if (state.currentUser && !localStorage.getItem(LEGACY_MIGRATED_MARKER_KEY)) {
        const legacyData = localStorage.getItem(LEGACY_STORAGE_KEY);
        if (legacyData) {
            localStorage.setItem(userStorageKey, legacyData);
            localStorage.removeItem(LEGACY_STORAGE_KEY);
            localStorage.setItem(LEGACY_MIGRATED_MARKER_KEY, '1');
            data = legacyData;
        }
    }

    return data;
}

function migrateGalleryFromCharacterMessages() {
    const migrated = [];
    const seen = new Set();

    const allCharacters = state.characters.length > 0
        ? state.characters
        : [{ ...defaultCharacter }];

    allCharacters.forEach(character => {
        const characterMessages = Array.isArray(character.messages) ? character.messages : [];

        characterMessages.forEach(message => {
            if (message.role !== 'assistant' || (!message.imageUrl && !message.videoUrl)) return;

            const mediaUrl = message.videoUrl || message.imageUrl;
            const dedupeKey = `${character.id}::${message.id || ''}::${mediaUrl}`;
            if (seen.has(dedupeKey)) return;
            seen.add(dedupeKey);

            migrated.push({
                id: generateId(),
                imageUrl: message.imageUrl || null,
                videoUrl: message.videoUrl || null,
                characterId: character.id || 'default',
                characterName: character.name || 'Unknown Character',
                characterAvatar: character.avatar || '🤖',
                source: message.videoUrl ? 'chat-video' : 'chat',
                messageId: message.id || null,
                createdAt: new Date().toISOString()
            });
        });
    });

    return migrated;
}

// Save state to localStorage
export function saveToLocalStorage() {
    // Sync current messages to the current character in the list
    const currentCharIndex = state.characters.findIndex(c => c.id === state.currentCharacterId);
    if (currentCharIndex !== -1) {
        state.characters[currentCharIndex].messages = [...state.messages];
    } else if (state.currentCharacterId === 'default') {
        const defaultInList = state.characters.find(c => c.id === 'default');
        if (defaultInList) {
            defaultInList.messages = [...state.messages];
        }
    }

    const data = {
        settings: state.settings,
        characters: state.characters,
        currentCharacterId: state.currentCharacterId,
        galleryImages: state.galleryImages,
        galleryFilterCharacterId: state.galleryFilterCharacterId
        // No longer saving top-level messages
    };
    localStorage.setItem(getStorageKeyForCurrentUser(), JSON.stringify(data));
}

// Load state from localStorage
export function loadFromLocalStorage() {
    const data = readStoredData();
    let migratedMessages = null;

    if (data) {
        try {
            const parsed = JSON.parse(data);
            if (parsed.settings) {
                if (parsed.settings.textProvider === 'grok') {
                    parsed.settings.textProvider = 'premium';
                }
                if (parsed.settings.imageProvider === 'grok') {
                    parsed.settings.imageProvider = 'premium';
                }
                Object.assign(state.settings, parsed.settings);
                updateSettingsUI();
            }
            if (parsed.characters) {
                state.characters = parsed.characters;
            }
            if (parsed.currentCharacterId) {
                state.currentCharacterId = parsed.currentCharacterId;
            }
            if (Array.isArray(parsed.galleryImages)) {
                state.galleryImages = parsed.galleryImages;
            }
            if (parsed.galleryFilterCharacterId) {
                state.galleryFilterCharacterId = parsed.galleryFilterCharacterId;
            }
            // Temporarily store old top-level messages for migration
            if (parsed.messages && parsed.messages.length > 0) {
                migratedMessages = parsed.messages;
            }
        } catch (e) {
            console.error('Failed to load from localStorage:', e);
        }
    }

    // Ensure we have at least the default character
    if (state.characters.length === 0) {
        state.characters = [{ ...defaultCharacter }];
    }

    // Set default character if none selected
    if (!state.currentCharacterId) {
        state.currentCharacterId = 'default';
    }

    // Handle migration if needed
    if (migratedMessages) {
        const currentChar = state.characters.find(c => c.id === (state.currentCharacterId || 'default')) ||
            state.characters.find(c => c.id === 'default');
        if (currentChar && (!currentChar.messages || currentChar.messages.length === 0)) {
            currentChar.messages = migratedMessages;
        }
    }

    // Populate active messages from current character
    const character = state.characters.find(c => c.id === state.currentCharacterId) ||
        state.characters.find(c => c.id === 'default') ||
        state.characters[0];

    if (character) {
        state.messages = character.messages || [];
    }

    if (!Array.isArray(state.galleryImages) || state.galleryImages.length === 0) {
        state.galleryImages = migrateGalleryFromCharacterMessages();
    }

    if (!state.galleryFilterCharacterId) {
        state.galleryFilterCharacterId = 'all';
    }

    renderCharactersList();
    updateCurrentCharacterUI();
    renderMessages();
}

// Update settings UI from state
export function updateSettingsUI() {
    elements.textProvider.value = state.settings.textProvider || 'premium';
    elements.openrouterKey.value = state.settings.openrouterKey;
    elements.openrouterModel.value = state.settings.openrouterModel;
    elements.swarmUrl.value = state.settings.swarmUrl;
    elements.swarmModel.value = state.settings.swarmModel;
    elements.imageProvider.value = state.settings.imageProvider || 'local';
    elements.enableImageGeneration.checked = state.settings.enableImageGeneration !== false;
    elements.imgWidth.value = state.settings.imgWidth;
    elements.imgHeight.value = state.settings.imgHeight;
    elements.steps.value = state.settings.steps;
    elements.stepsValue.textContent = state.settings.steps;
    elements.cfgScale.value = state.settings.cfgScale;
    elements.cfgValue.textContent = state.settings.cfgScale;
    elements.sampler.value = state.settings.sampler;
    elements.systemPrompt.value = state.settings.systemPrompt;
}
