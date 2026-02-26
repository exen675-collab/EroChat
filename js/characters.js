import { state } from './state.js';
import { defaultCharacter } from './config.js';
import { elements } from './dom.js';
import { saveToLocalStorage } from './storage.js';
import { escapeHtml, formatMessage } from './utils.js';
import { generateCharacterSystemPrompt } from './api-openrouter.js';

// Track if we're editing an existing character
let editingCharacterId = null;

// Get current character
export function getCurrentCharacter() {
    const selected = state.characters.find(c => c.id === state.currentCharacterId);
    if (selected) return selected;

    const storedDefault = state.characters.find(c => c.id === 'default');
    if (storedDefault) return storedDefault;

    return {
        ...defaultCharacter,
        systemPrompt: state.settings.systemPrompt || defaultCharacter.systemPrompt,
        messages: state.messages || []
    };
}

// Render characters list in sidebar
export function renderCharactersList() {
    elements.charactersList.innerHTML = '';

    const storedDefault = state.characters.find(c => c.id === 'default');
    const defaultEntry = storedDefault || { ...defaultCharacter };
    const allCharacters = [defaultEntry, ...state.characters.filter(c => c.id !== 'default' && !c.isDefault)];

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

// Set character thumbnail from gallery image
export function setCharacterThumbnail(characterId, imageUrl) {
    if (!characterId || !imageUrl) return false;

    const index = state.characters.findIndex(c => c.id === characterId);

    if (index !== -1) {
        state.characters[index].thumbnail = imageUrl;
    } else if (characterId === 'default') {
        state.characters.unshift({ ...defaultCharacter, thumbnail: imageUrl, messages: [...state.messages] });
    } else {
        return false;
    }

    renderCharactersList();
    updateCurrentCharacterUI();
    saveToLocalStorage();
    return true;
}

// Select a character
export function selectCharacter(charId) {
    // Save current messages to the previous character before switching
    const oldCharIndex = state.characters.findIndex(c => c.id === state.currentCharacterId);
    if (oldCharIndex !== -1) {
        state.characters[oldCharIndex].messages = [...state.messages];
    } else if (state.currentCharacterId === 'default') {
        // Handle default if it's not in the array for some reason (though it should be)
        const defaultInList = state.characters.find(c => c.id === 'default');
        if (defaultInList) {
            defaultInList.messages = [...state.messages];
        }
    }

    state.currentCharacterId = charId;
    const character = getCurrentCharacter();

    // Load messages for the new character
    state.messages = character.messages || [];

    // Update system prompt in settings
    elements.systemPrompt.value = character.systemPrompt;
    state.settings.systemPrompt = character.systemPrompt;

    renderCharactersList();
    updateCurrentCharacterUI();

    // Import and call renderMessages to refresh the chat view
    import('./messages.js').then(m => m.renderMessages());

    saveToLocalStorage();

    if (window.innerWidth < 1024) {
        import('./ui.js').then(ui => ui.toggleSidebar(false));
    }
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
            selectCharacter('default');
        } else {
            renderCharactersList();
            saveToLocalStorage();
        }
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
            elements.charBackground.value = character.background || '';
            elements.charUserInfo.value = character.userInfo || '';
            elements.charAppearance.value = character.appearance || '';

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
        elements.charAppearance.value = '';
        elements.charDescription.value = '';
        elements.charBackground.value = '';
        elements.charUserInfo.value = '';
        elements.charSystemPrompt.value = '';
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

// Generate system prompt on demand
export async function generateSystemPromptOnDemand() {
    const name = elements.charName.value.trim();
    const description = elements.charDescription.value.trim();
    const background = elements.charBackground.value.trim();
    const userInfo = elements.charUserInfo.value.trim();

    if (!name || !description || !userInfo) {
        alert('Please fill in Name, Description, and User Info first.');
        return;
    }

    const textProvider = elements.textProvider.value || state.settings.textProvider || 'openrouter';
    if (textProvider === 'grok') {
        if (!elements.grokModel.value) {
            alert('Please select a Grok model in settings.');
            return;
        }
    } else if (!elements.openrouterKey.value || !elements.openrouterModel.value) {
        alert('Please enter your OpenRouter API key and select a model in settings.');
        return;
    }

    const originalBtnContent = elements.generatePromptBtn.innerHTML;
    elements.generatePromptBtn.disabled = true;
    elements.generatePromptBtn.innerHTML = `
        <svg class="w-3 h-3 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path>
        </svg>
        Generating...
    `;

    try {
        const systemPrompt = await generateCharacterSystemPrompt({
            name,
            description,
            background,
            userInfo
        });

        if (systemPrompt) {
            elements.charSystemPrompt.value = systemPrompt;
            alert('System prompt generated successfully! You can now review and edit it.');
        } else {
            throw new Error('Model returned an empty prompt.');
        }
    } catch (error) {
        console.error('Prompt generation error:', error);
        alert('Failed to generate prompt: ' + error.message);
    } finally {
        elements.generatePromptBtn.disabled = false;
        elements.generatePromptBtn.innerHTML = originalBtnContent;
    }
}

// Save character (create or update)
export async function saveCharacter() {
    const name = elements.charName.value.trim();
    const avatar = elements.charAvatar.value.trim() || '🤖';
    let systemPrompt = elements.charSystemPrompt.value.trim();
    const description = elements.charDescription.value.trim();
    const background = elements.charBackground.value.trim();
    const userInfo = elements.charUserInfo.value.trim();
    const appearance = elements.charAppearance.value.trim();

    if (!name) {
        alert('Please enter a character name.');
        return;
    }

    if (!description) {
        alert('Please enter a description / personality.');
        return;
    }

    if (!userInfo) {
        alert('Please enter user info and description.');
        return;
    }

    if (!systemPrompt) {
        if (editingCharacterId) {
            alert('Please enter a system prompt.');
            return;
        }

        const textProvider = elements.textProvider.value || state.settings.textProvider || 'openrouter';
        if (textProvider === 'grok') {
            if (!elements.grokModel.value) {
                alert('Please select a Grok model in settings to auto-generate a system prompt.');
                return;
            }
        } else if (!elements.openrouterKey.value || !elements.openrouterModel.value) {
            alert('Please enter your OpenRouter API key and select a model in settings to auto-generate a system prompt.');
            return;
        }

        const originalSaveLabel = elements.saveCharBtn.innerHTML;
        elements.saveCharBtn.disabled = true;
        elements.saveCharBtn.innerHTML = 'Generating Prompt...';

        try {
            systemPrompt = await generateCharacterSystemPrompt({
                name,
                description,
                background,
                userInfo
            });

            if (!systemPrompt) {
                throw new Error('Model returned an empty system prompt.');
            }

            elements.charSystemPrompt.value = systemPrompt;
        } catch (error) {
            console.error('System prompt generation error:', error);
            alert('Failed to generate system prompt: ' + error.message);
            elements.saveCharBtn.disabled = false;
            elements.saveCharBtn.innerHTML = originalSaveLabel;
            return;
        }

        elements.saveCharBtn.disabled = false;
        elements.saveCharBtn.innerHTML = originalSaveLabel;
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
                description,
                background,
                userInfo,
                appearance
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
            background,
            userInfo,
            appearance,
            isDefault: false,
            messages: []
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
    const description = elements.charAppearance.value.trim();
    const name = elements.charName.value.trim();

    if (!description) {
        alert('Please enter a character appearance for image generation.');
        return;
    }

    const imageProvider = elements.imageProvider.value || state.settings.imageProvider || 'local';
    if (imageProvider === 'local' && !elements.swarmModel.value) {
        alert('Please select a SwarmUI model first.');
        return;
    }

    // Import selected image provider API
    const { generateImage } = await import('./api-image.js');

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
        alert('Failed to generate thumbnail. Check your image provider settings.');
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
