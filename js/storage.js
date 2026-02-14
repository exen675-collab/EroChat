import { state } from './state.js';
import { defaultCharacter } from './config.js';
import { elements } from './dom.js';
import { renderCharactersList, updateCurrentCharacterUI } from './characters.js';
import { renderMessages } from './messages.js';

// Save state to localStorage
export function saveToLocalStorage() {
    const data = {
        settings: state.settings,
        messages: state.messages,
        characters: state.characters,
        currentCharacterId: state.currentCharacterId
    };
    localStorage.setItem('erochat_data', JSON.stringify(data));
}

// Load state from localStorage
export function loadFromLocalStorage() {
    const data = localStorage.getItem('erochat_data');
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
            if (parsed.messages && parsed.messages.length > 0) {
                state.messages = parsed.messages;
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
