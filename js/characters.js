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

        // Create thumbnail or avatar display
        const thumbnailHtml = char.thumbnail
            ? `<div class="w-16 h-16 rounded-lg overflow-hidden flex-shrink-0 bg-gradient-to-br from-purple-900/30 to-pink-900/30">
                <img src="${char.thumbnail}" alt="${escapeHtml(char.name)}" class="w-full h-full object-cover">
               </div>`
            : `<div class="w-16 h-16 rounded-lg flex-shrink-0 bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
                <span class="text-3xl">${char.avatar}</span>
               </div>`;

        charDiv.innerHTML = `
            <div class="flex items-center gap-3 flex-1 cursor-pointer" onclick="window.selectCharacter('${char.id}')">
                ${thumbnailHtml}
                <div class="flex-1 min-w-0">
                    <p class="font-medium text-sm truncate ${isActive ? 'text-pink-400' : 'text-gray-300'}">${escapeHtml(char.name)}</p>
                    <p class="text-xs text-gray-500 truncate">${char.isDefault ? 'Default' : 'Custom'}</p>
                </div>
            </div>
            ${!char.isDefault ? `
                <div class="flex gap-1">
                    <button onclick="window.editCharacter('${char.id}')" class="p-1.5 hover:bg-purple-900/30 rounded-lg text-purple-400 transition-colors" title="Edit">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path>
                        </svg>
                    </button>
                    <button onclick="window.deleteCharacter('${char.id}')" class="p-1.5 hover:bg-red-900/30 rounded-lg text-red-400 transition-colors" title="Delete">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path>
                        </svg>
                    </button>
                </div>
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

// Edit a character
export function editCharacter(charId) {
    openCharacterModal(charId);
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
            elements.charDescription.value = character.description || '';

            // Set current thumbnail for editing
            currentThumbnail = character.thumbnail || null;

            // Display existing thumbnail if available
            if (character.thumbnail) {
                elements.thumbnailPreview.innerHTML = `
                    <img src="${character.thumbnail}" alt="${character.name}" class="w-full h-full object-cover">
                `;
            } else {
                resetThumbnailPreview();
            }
        }
    } else {
        elements.modalTitle.textContent = 'Create Character';
        elements.charName.value = '';
        elements.charAvatar.value = '🤖';
        elements.charDescription.value = '';
        elements.charSystemPrompt.value = `You are a seductive and creative erotic roleplay partner named [Character Name]. You describe scenes in a vivid, sensual, extremely detailed way. You always stay in character.

After your text response, ALWAYS append EXACTLY this block (nothing more):
---IMAGE_PROMPT START---
masterpiece, best quality, ultra-detailed, 8k, realistic, [very detailed, NSFW English prompt for Stable Diffusion – current scene, characters, poses, clothing/lack of it, lighting, mood, body details, facial expression, camera angle etc.]
---IMAGE_PROMPT END---`;
        currentThumbnail = null;
        resetThumbnailPreview();
    }

    elements.characterModal.classList.remove('hidden');
}

// Reset thumbnail preview to default state
function resetThumbnailPreview() {
    elements.thumbnailPreview.innerHTML = `
        <div class="text-center text-gray-500">
            <svg class="w-16 h-16 mx-auto mb-2 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"></path>
            </svg>
            <p class="text-sm">No thumbnail</p>
        </div>
    `;
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
    const description = elements.charDescription.value.trim();

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
            const updatedChar = {
                ...state.characters[index],
                name,
                avatar,
                systemPrompt,
                description
            };
            // Only update thumbnail if a new one was generated
            if (currentThumbnail) {
                updatedChar.thumbnail = currentThumbnail;
            }
            state.characters[index] = updatedChar;
        }
    } else {
        // Create new character
        const newCharacter = {
            id: 'char_' + Date.now(),
            name,
            avatar,
            systemPrompt,
            description,
            isDefault: false
        };
        // Add thumbnail if one was generated
        if (currentThumbnail) {
            newCharacter.thumbnail = currentThumbnail;
        }
        state.characters.push(newCharacter);
    }

    // Reset thumbnail for next character
    currentThumbnail = null;

    renderCharactersList();
    saveToLocalStorage();
    closeCharacterModal();
}

// Store the current thumbnail temporarily during generation
let currentThumbnail = null;

// Generate thumbnail for character
export async function generateThumbnail() {
    const description = elements.charDescription.value.trim();
    const name = elements.charName.value.trim();

    if (!description) {
        alert('Please enter a character description for image generation.');
        return;
    }

    // Import SwarmUI API
    const { generateImage } = await import('./api-swarmui.js');

    // Build the prompt
    const prompt = `masterpiece, best quality, ultra-detailed, 8k, realistic, portrait, ${description}`;

    // Show loading state
    elements.generateThumbnailBtn.disabled = true;
    elements.generateThumbnailBtn.innerHTML = `
        <svg class="w-4 h-4 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path>
        </svg>
        Generating...
    `;

    try {
        // Generate the image with portrait dimensions
        const imageBase64 = await generateImage(prompt, 512, 768);

        if (imageBase64) {
            currentThumbnail = imageBase64;

            // Update preview
            elements.thumbnailPreview.innerHTML = `
                <img src="${imageBase64}" alt="${name}" class="w-full h-full object-cover">
            `;

            // Save thumbnail to character if editing
            if (editingCharacterId) {
                const index = state.characters.findIndex(c => c.id === editingCharacterId);
                if (index !== -1) {
                    state.characters[index].thumbnail = imageBase64;
                    saveToLocalStorage();
                    renderCharactersList();
                }
            }
        }
    } catch (error) {
        console.error('Thumbnail generation error:', error);
        alert('Failed to generate thumbnail. Make sure SwarmUI is running and configured.');
    } finally {
        // Reset button
        elements.generateThumbnailBtn.disabled = false;
        elements.generateThumbnailBtn.innerHTML = `
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"></path>
            </svg>
            Generate Thumbnail
        `;
    }
}
