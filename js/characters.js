import { state } from './state.js';
import { defaultCharacter } from './config.js';
import { elements } from './dom.js';
import { saveToLocalStorage } from './storage.js';
import { escapeHtml, formatMessage } from './utils.js';

// Track if we're editing an existing character
let editingCharacterId = null;

// Get current character
export function getCurrentCharacter() {
    if (state.currentCharacterId === 'default') {
        return defaultCharacter;
    }
    return state.characters.find(c => c.id === state.currentCharacterId) || defaultCharacter;
}

// Render characters list in sidebar
export function renderCharactersList() {
    elements.charactersList.innerHTML = '';
    
    // Add default character first
    const allCharacters = [{ ...defaultCharacter }, ...state.characters.filter(c => !c.isDefault)];
    
    allCharacters.forEach(char => {
        const isActive = state.currentCharacterId === char.id;
        const charDiv = document.createElement('div');
        charDiv.className = `character-card p-3 rounded-lg border border-purple-900/30 flex items-center justify-between ${isActive ? 'active' : ''}`;
        charDiv.innerHTML = `
            <div class="flex items-center gap-3 flex-1" onclick="window.selectCharacter('${char.id}')">
                <span class="text-2xl">${char.avatar}</span>
                <div class="flex-1 min-w-0">
                    <p class="font-medium text-sm truncate ${isActive ? 'text-pink-400' : 'text-gray-300'}">${escapeHtml(char.name)}</p>
                    <p class="text-xs text-gray-500 truncate">${char.isDefault ? 'Default' : 'Custom'}</p>
                </div>
            </div>
            ${!char.isDefault ? `
                <button onclick="window.deleteCharacter('${char.id}')" class="p-1.5 hover:bg-red-900/30 rounded-lg text-red-400 transition-colors ml-2">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path>
                    </svg>
                </button>
            ` : ''}
        `;
        elements.charactersList.appendChild(charDiv);
    });
}

// Select a character
export function selectCharacter(charId) {
    state.currentCharacterId = charId;
    const character = getCurrentCharacter();
    
    // Update system prompt in settings
    elements.systemPrompt.value = character.systemPrompt;
    state.settings.systemPrompt = character.systemPrompt;
    
    renderCharactersList();
    updateCurrentCharacterUI();
    saveToLocalStorage();
}

// Update current character UI elements
export function updateCurrentCharacterUI() {
    const character = getCurrentCharacter();
    elements.currentCharacterName.textContent = character.name;
    elements.welcomeAvatar.textContent = character.avatar;
    elements.typingAvatar.textContent = character.avatar;
    
    // Update welcome message with character name
    elements.welcomeMessage.innerHTML = `
        Welcome to <strong class="text-pink-400">EroChat + SwarmUI</strong>! I'm <strong class="text-purple-400">${escapeHtml(character.name)}</strong>, ready for intimate conversations. 
        Every response I give will be automatically visualized using your local SwarmUI instance.
    `;
}

// Delete a character
export function deleteCharacter(charId) {
    if (confirm('Are you sure you want to delete this character?')) {
        state.characters = state.characters.filter(c => c.id !== charId);
        
        // If we deleted the current character, switch to default
        if (state.currentCharacterId === charId) {
            state.currentCharacterId = 'default';
            elements.systemPrompt.value = defaultCharacter.systemPrompt;
            state.settings.systemPrompt = defaultCharacter.systemPrompt;
        }
        
        renderCharactersList();
        updateCurrentCharacterUI();
        saveToLocalStorage();
    }
}

// Open character modal (for create or edit)
export function openCharacterModal(characterId = null) {
    editingCharacterId = characterId;
    
    if (characterId) {
        const character = state.characters.find(c => c.id === characterId);
        if (character) {
            elements.modalTitle.textContent = 'Edit Character';
            elements.charName.value = character.name;
            elements.charAvatar.value = character.avatar;
            elements.charSystemPrompt.value = character.systemPrompt;
        }
    } else {
        elements.modalTitle.textContent = 'Create Character';
        elements.charName.value = '';
        elements.charAvatar.value = '🤖';
        elements.charSystemPrompt.value = `You are a seductive and creative erotic roleplay partner named [Character Name]. You describe scenes in a vivid, sensual, extremely detailed way. You always stay in character.

After your text response, ALWAYS append EXACTLY this block (nothing more):
---IMAGE_PROMPT START---
masterpiece, best quality, ultra-detailed, 8k, realistic, [very detailed, NSFW English prompt for Stable Diffusion – current scene, characters, poses, clothing/lack of it, lighting, mood, body details, facial expression, camera angle etc.]
---IMAGE_PROMPT END---`;
    }
    
    elements.characterModal.classList.remove('hidden');
}

// Close character modal
export function closeCharacterModal() {
    elements.characterModal.classList.add('hidden');
    editingCharacterId = null;
}

// Save character (create or update)
export function saveCharacter() {
    const name = elements.charName.value.trim();
    const avatar = elements.charAvatar.value.trim() || '🤖';
    const systemPrompt = elements.charSystemPrompt.value.trim();
    
    if (!name) {
        alert('Please enter a character name.');
        return;
    }
    
    if (!systemPrompt) {
        alert('Please enter a system prompt.');
        return;
    }
    
    if (editingCharacterId) {
        // Edit existing character
        const index = state.characters.findIndex(c => c.id === editingCharacterId);
        if (index !== -1) {
            state.characters[index] = {
                ...state.characters[index],
                name,
                avatar,
                systemPrompt
            };
        }
    } else {
        // Create new character
        const newCharacter = {
            id: 'char_' + Date.now(),
            name,
            avatar,
            systemPrompt,
            isDefault: false
        };
        state.characters.push(newCharacter);
    }
    
    renderCharactersList();
    saveToLocalStorage();
    closeCharacterModal();
}
