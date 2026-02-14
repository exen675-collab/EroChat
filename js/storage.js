import { state } from './state.js';
import { defaultCharacter } from './config.js';
import { elements } from './dom.js';
import { renderCharactersList, updateCurrentCharacterUI } from './characters.js';
import { renderMessages } from './messages.js';

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
        currentCharacterId: state.currentCharacterId
        // No longer saving top-level messages
    };
    localStorage.setItem('erochat_data', JSON.stringify(data));
}

// Load state from localStorage
export function loadFromLocalStorage() {
    const data = localStorage.getItem('erochat_data');
    let migratedMessages = null;

    if (data) {
        try {
            const parsed = JSON.parse(data);
            if (parsed.settings) {
                Object.assign(state.settings, parsed.settings);
                updateSettingsUI();
            }
            if (parsed.characters) {
                state.characters = parsed.characters;
            }
            if (parsed.currentCharacterId) {
                state.currentCharacterId = parsed.currentCharacterId;
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

    renderCharactersList();
    updateCurrentCharacterUI();
    renderMessages();
}

// Update settings UI from state
export function updateSettingsUI() {
    elements.openrouterKey.value = state.settings.openrouterKey;
    elements.openrouterModel.value = state.settings.openrouterModel;
    elements.swarmUrl.value = state.settings.swarmUrl;
    elements.swarmModel.value = state.settings.swarmModel;
    elements.imgWidth.value = state.settings.imgWidth;
    elements.imgHeight.value = state.settings.imgHeight;
    elements.steps.value = state.settings.steps;
    elements.stepsValue.textContent = state.settings.steps;
    elements.cfgScale.value = state.settings.cfgScale;
    elements.cfgValue.textContent = state.settings.cfgScale;
    elements.sampler.value = state.settings.sampler;
    elements.systemPrompt.value = state.settings.systemPrompt;
}
