import { state } from './state.js';
import { defaultCharacter } from './config.js';
import { elements } from './dom.js';
import { renderCharactersList, updateCurrentCharacterUI } from './characters.js';
import { renderMessages } from './messages.js';
import { ensureStatisticsShape } from './stats.js';
import {
    generateId,
    normalizeContextMessageCount,
    normalizeImageProvider,
    normalizeSwarmSampler,
    syncSwarmSamplerSelect
} from './utils.js';

const LEGACY_STORAGE_KEY = 'erochat_data';
const USER_STORAGE_KEY_PREFIX = 'erochat_data_user_';
const LEGACY_MIGRATED_MARKER_KEY = 'erochat_data_legacy_migrated';
const MAX_STORAGE_TRIM_ATTEMPTS = 200;

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
            try {
                localStorage.setItem(userStorageKey, legacyData);
                localStorage.removeItem(LEGACY_STORAGE_KEY);
                localStorage.setItem(LEGACY_MIGRATED_MARKER_KEY, '1');
            } catch (error) {
                console.warn('Skipping legacy storage migration due to storage limits:', error);
            }
            data = legacyData;
        }
    }

    return data;
}

function migrateGalleryFromCharacterMessages() {
    const migrated = [];
    const seen = new Set();

    const allCharacters =
        state.characters.length > 0 ? state.characters : [{ ...defaultCharacter }];

    allCharacters.forEach((character) => {
        const characterMessages = Array.isArray(character.messages) ? character.messages : [];

        characterMessages.forEach((message) => {
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

function isDataUrl(value) {
    return typeof value === 'string' && value.startsWith('data:');
}

function isQuotaExceededError(error) {
    if (!error) return false;
    if (error.name === 'QuotaExceededError' || error.name === 'NS_ERROR_DOM_QUOTA_REACHED')
        return true;
    return error.code === 22 || error.code === 1014;
}

function syncCurrentMessagesToCharacter() {
    const currentCharIndex = state.characters.findIndex((c) => c.id === state.currentCharacterId);
    if (currentCharIndex !== -1) {
        state.characters[currentCharIndex].messages = [...state.messages];
    } else if (state.currentCharacterId === 'default') {
        const defaultInList = state.characters.find((c) => c.id === 'default');
        if (defaultInList) {
            defaultInList.messages = [...state.messages];
        }
    }
}

function buildPersistedData() {
    return {
        settings: state.settings,
        characters: state.characters,
        currentCharacterId: state.currentCharacterId,
        galleryImages: state.galleryImages,
        galleryFilterCharacterId: state.galleryFilterCharacterId,
        gallerySourceFilter: state.gallerySourceFilter || 'all',
        currentView: state.currentView || 'chat',
        generatorPrefs: state.generatorPrefs,
        statistics: state.statistics
        // No longer saving top-level messages
    };
}

function removeOldestGalleryItem(preferDataUrls = false) {
    if (!Array.isArray(state.galleryImages) || state.galleryImages.length === 0) {
        return false;
    }

    if (preferDataUrls) {
        for (let i = state.galleryImages.length - 1; i >= 0; i -= 1) {
            const item = state.galleryImages[i];
            if (isDataUrl(item?.imageUrl) || isDataUrl(item?.videoUrl)) {
                state.galleryImages.splice(i, 1);
                return true;
            }
        }
        return false;
    }

    state.galleryImages.pop();
    return true;
}

function clearOldestMessageMedia(preferDataUrls = false) {
    for (const character of state.characters) {
        const messages = Array.isArray(character.messages) ? character.messages : [];
        for (const message of messages) {
            if (message.role !== 'assistant') continue;

            const hasImage = typeof message.imageUrl === 'string' && message.imageUrl.length > 0;
            const hasVideo = typeof message.videoUrl === 'string' && message.videoUrl.length > 0;
            if (!hasImage && !hasVideo) continue;

            const hasDataUrl = isDataUrl(message.imageUrl) || isDataUrl(message.videoUrl);
            if (preferDataUrls && !hasDataUrl) continue;

            message.imageUrl = null;
            message.videoUrl = null;

            if (message.id) {
                const activeMessage = state.messages.find((m) => m.id === message.id);
                if (activeMessage) {
                    activeMessage.imageUrl = null;
                    activeMessage.videoUrl = null;
                }
            }
            return true;
        }
    }

    return false;
}

function clearCharacterThumbnail(preferDataUrls = false) {
    for (const character of state.characters) {
        const thumbnail = character?.thumbnail;
        if (!thumbnail) continue;
        if (preferDataUrls && !isDataUrl(thumbnail)) continue;

        delete character.thumbnail;
        return true;
    }
    return false;
}

function pruneStateForStorage() {
    return (
        removeOldestGalleryItem(true) ||
        clearOldestMessageMedia(true) ||
        clearCharacterThumbnail(true) ||
        removeOldestGalleryItem(false) ||
        clearOldestMessageMedia(false) ||
        clearCharacterThumbnail(false)
    );
}

// Save state to localStorage
export function saveToLocalStorage() {
    syncCurrentMessagesToCharacter();

    const storageKey = getStorageKeyForCurrentUser();
    let attempts = 0;

    while (attempts <= MAX_STORAGE_TRIM_ATTEMPTS) {
        try {
            localStorage.setItem(storageKey, JSON.stringify(buildPersistedData()));
            return true;
        } catch (error) {
            if (!isQuotaExceededError(error)) {
                console.error('Failed to save to localStorage:', error);
                return false;
            }

            const pruned = pruneStateForStorage();
            if (!pruned) {
                console.warn('localStorage quota exceeded and no more data can be pruned.');
                return false;
            }

            attempts += 1;
        }
    }

    console.warn('localStorage quota exceeded after max prune attempts.');
    return false;
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
                Object.assign(state.settings, parsed.settings);
                state.settings.imageProvider = normalizeImageProvider(state.settings.imageProvider);
                state.settings.sampler = normalizeSwarmSampler(state.settings.sampler);
                state.settings.contextMessageCount = normalizeContextMessageCount(
                    state.settings.contextMessageCount
                );
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
            if (parsed.gallerySourceFilter) {
                state.gallerySourceFilter = parsed.gallerySourceFilter;
            }
            if (parsed.currentView) {
                state.currentView = parsed.currentView;
            }
            if (parsed.generatorPrefs && typeof parsed.generatorPrefs === 'object') {
                Object.assign(state.generatorPrefs, parsed.generatorPrefs);
                state.generatorPrefs.swarmSampler = normalizeSwarmSampler(
                    state.generatorPrefs.swarmSampler
                );
            }
            state.statistics = ensureStatisticsShape(parsed.statistics);
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
        const currentChar =
            state.characters.find((c) => c.id === (state.currentCharacterId || 'default')) ||
            state.characters.find((c) => c.id === 'default');
        if (currentChar && (!currentChar.messages || currentChar.messages.length === 0)) {
            currentChar.messages = migratedMessages;
        }
    }

    // Populate active messages from current character
    const character =
        state.characters.find((c) => c.id === state.currentCharacterId) ||
        state.characters.find((c) => c.id === 'default') ||
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

    if (!state.gallerySourceFilter) {
        state.gallerySourceFilter = 'all';
    }

    if (!state.currentView) {
        state.currentView = 'chat';
    }

    state.statistics = ensureStatisticsShape(state.statistics);

    updateSettingsUI();
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
    elements.comfyUrl.value = state.settings.comfyUrl || 'http://localhost:8188';
    elements.comfyModel.value = state.settings.comfyModel || '';
    elements.imageProvider.value = normalizeImageProvider(state.settings.imageProvider);
    elements.enableImageGeneration.checked = state.settings.enableImageGeneration !== false;
    elements.contextMessageCount.value = normalizeContextMessageCount(
        state.settings.contextMessageCount
    );
    elements.imgWidth.value = state.settings.imgWidth;
    elements.imgHeight.value = state.settings.imgHeight;
    elements.steps.value = state.settings.steps;
    elements.stepsValue.textContent = state.settings.steps;
    elements.cfgScale.value = state.settings.cfgScale;
    elements.cfgValue.textContent = state.settings.cfgScale;
    syncSwarmSamplerSelect(elements.sampler, state.settings.sampler);
    elements.systemPrompt.value = state.settings.systemPrompt;
}
