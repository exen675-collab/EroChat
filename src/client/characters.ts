// @ts-nocheck
import { state } from './state.js';
import { defaultCharacter } from './config.js';
import { elements } from './dom.js';
import { saveToLocalStorage } from './storage.js';
import { escapeHtml, normalizeContextMessageCount } from './utils.js';
import { requestConfirmation, showToast } from './notifications.js';
import {
    renderProtectedSystemPromptBlocks,
    stripProtectedSystemPromptBlocks
} from './static-prompts.js';

// Track if we're editing an existing character
let editingCharacterId = null;

function setCharacterFormStatus(message, isError = false, options = {}) {
    if (!elements.characterFormStatus) {
        return;
    }

    if (!message) {
        elements.characterFormStatus.hidden = true;
        elements.characterFormStatus.textContent = '';
        elements.characterFormStatus.className = 'hidden mb-4 rounded-xl border px-4 py-3 text-sm';
        return;
    }

    const { actionLabel, onAction } = options;
    elements.characterFormStatus.hidden = false;
    elements.characterFormStatus.className = `mb-4 rounded-xl border px-4 py-3 text-sm ${isError ? 'border-red-700/60 bg-red-950/40 text-red-200' : 'border-emerald-700/50 bg-emerald-950/30 text-emerald-200'}`;
    elements.characterFormStatus.innerHTML = '';

    const copy = document.createElement('div');
    copy.className = 'flex items-center justify-between gap-3';

    const text = document.createElement('span');
    text.textContent = message;
    copy.appendChild(text);

    if (actionLabel && typeof onAction === 'function') {
        const actionBtn = document.createElement('button');
        actionBtn.type = 'button';
        actionBtn.textContent = actionLabel;
        actionBtn.className =
            'px-3 py-1.5 rounded-lg border border-white/10 text-xs font-semibold text-white/90 hover:bg-white/10 transition-colors';
        actionBtn.addEventListener('click', onAction);
        copy.appendChild(actionBtn);
    }

    elements.characterFormStatus.appendChild(copy);
}

// Get current character
export function getCurrentCharacter() {
    const selected = state.characters.find((c) => c.id === state.currentCharacterId);
    if (selected) return selected;

    const storedDefault = state.characters.find((c) => c.id === 'default');
    if (storedDefault) return storedDefault;

    return {
        ...defaultCharacter,
        systemPrompt: state.settings.systemPrompt || defaultCharacter.systemPrompt,
        messages: state.messages || []
    };
}

function getCreatedAtTime(item) {
    const parsed = Date.parse(item?.createdAt || '');
    return Number.isFinite(parsed) ? parsed : Number.POSITIVE_INFINITY;
}

export function getDefaultGeneratedCharacterThumbnail(characterId) {
    if (!characterId || !Array.isArray(state.galleryImages)) return null;

    const firstGeneratedImage = state.galleryImages
        .filter((item) => item?.characterId === characterId && item.imageUrl)
        .sort((a, b) => getCreatedAtTime(a) - getCreatedAtTime(b))[0];

    return firstGeneratedImage?.imageUrl || null;
}

export function getCharacterThumbnailUrl(character) {
    if (!character) return null;
    return character.thumbnail || getDefaultGeneratedCharacterThumbnail(character.id);
}

function getAllCharacters() {
    const storedDefault = state.characters.find((c) => c.id === 'default');
    const defaultEntry = storedDefault || { ...defaultCharacter };
    return [defaultEntry, ...state.characters.filter((c) => c.id !== 'default' && !c.isDefault)];
}

// Render characters list in sidebar
export function renderCharactersList() {
    elements.charactersList.innerHTML = '';

    const allCharacters = getAllCharacters();

    allCharacters.forEach((char) => {
        const isActive = state.currentCharacterId === char.id;
        const thumbnailUrl = getCharacterThumbnailUrl(char);
        const charDiv = document.createElement('div');
        charDiv.className = `character-card p-3 rounded-lg border border-purple-900/30 flex items-center justify-between ${isActive ? 'active' : ''}`;

        // Create thumbnail or avatar display
        const thumbnailHtml = thumbnailUrl
            ? `<div class="w-16 h-16 rounded-lg overflow-hidden flex-shrink-0 bg-gradient-to-br from-purple-900/30 to-pink-900/30">
                <img src="${escapeHtml(thumbnailUrl)}" alt="${escapeHtml(char.name)}" class="w-full h-full object-cover">
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
            ${
                !char.isDefault
                    ? `
                <div class="flex gap-1">
                    <button onclick="window.editCharacter('${char.id}')" class="p-1.5 hover:bg-purple-900/30 rounded-lg text-purple-400 transition-colors" title="Edit">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path>
                        </svg>
                    </button>
                </div>
            `
                    : ''
            }
        `;
        elements.charactersList.appendChild(charDiv);
    });

    renderCharactersWorkspace();
}

export function renderCharactersWorkspace() {
    if (!elements.charactersViewGrid) return;

    const allCharacters = getAllCharacters();

    if (allCharacters.length === 0) {
        elements.charactersViewGrid.innerHTML = `
            <div class="characters-empty glass">
                <p class="text-lg text-gray-200">No characters yet</p>
                <p class="text-sm text-gray-500">Create or import a character to start chatting.</p>
            </div>
        `;
        return;
    }

    elements.charactersViewGrid.innerHTML = '';

    allCharacters.forEach((char) => {
        const isActive = state.currentCharacterId === char.id;
        const thumbnailUrl = getCharacterThumbnailUrl(char);
        const messages =
            char.id === state.currentCharacterId
                ? state.messages
                : Array.isArray(char.messages)
                  ? char.messages
                  : [];
        const messageCount = messages.length;
        const description =
            char.description ||
            char.background ||
            char.appearance ||
            'Ready for a new conversation.';

        const thumbnailHtml = thumbnailUrl
            ? `<img src="${escapeHtml(thumbnailUrl)}" alt="${escapeHtml(char.name)}" class="characters-card-image">`
            : `<div class="characters-card-avatar">${char.avatar}</div>`;

        const card = document.createElement('article');
        card.className = `characters-card glass ${isActive ? 'is-active' : ''}`;
        card.innerHTML = `
            <button type="button" class="characters-card-select" data-character-id="${escapeHtml(char.id)}">
                <div class="characters-card-media">
                    ${thumbnailHtml}
                </div>
                <div class="characters-card-body">
                    <div class="characters-card-title-row">
                        <h3>${escapeHtml(char.name)}</h3>
                        ${isActive ? '<span class="characters-active-pill">Active</span>' : ''}
                    </div>
                    <p class="characters-card-description">${escapeHtml(description)}</p>
                    <div class="characters-card-meta">
                        <span>${char.isDefault ? 'Default' : 'Custom'}</span>
                        <span>${messageCount} messages</span>
                    </div>
                </div>
            </button>
            <div class="characters-card-actions">
                <button type="button" class="btn-primary characters-chat-btn" data-character-id="${escapeHtml(char.id)}">
                    Chat
                </button>
                ${
                    !char.isDefault
                        ? `
                    <button type="button" class="btn-secondary characters-edit-btn" data-character-id="${escapeHtml(char.id)}">
                        Edit
                    </button>
                `
                        : ''
                }
            </div>
        `;
        elements.charactersViewGrid.appendChild(card);
    });
}

// Set character thumbnail from gallery image
export function setCharacterThumbnail(characterId, imageUrl) {
    if (!characterId || !imageUrl) return false;

    const index = state.characters.findIndex((c) => c.id === characterId);

    if (index !== -1) {
        state.characters[index].thumbnail = imageUrl;
    } else if (characterId === 'default') {
        state.characters.unshift({
            ...defaultCharacter,
            thumbnail: imageUrl,
            messages: [...state.messages],
            contextMessageCount: state.settings.contextMessageCount,
            memorySnapshots: []
        });
    } else {
        return false;
    }

    renderCharactersList();
    renderCharactersWorkspace();
    updateCurrentCharacterUI();
    saveToLocalStorage();
    return true;
}

// Select a character
export function selectCharacter(charId) {
    // Save current messages to the previous character before switching
    const oldCharIndex = state.characters.findIndex((c) => c.id === state.currentCharacterId);
    if (oldCharIndex !== -1) {
        state.characters[oldCharIndex].messages = [...state.messages];
    } else if (state.currentCharacterId === 'default') {
        // Handle default if it's not in the array for some reason (though it should be)
        const defaultInList = state.characters.find((c) => c.id === 'default');
        if (defaultInList) {
            defaultInList.messages = [...state.messages];
        }
    }

    state.currentCharacterId = charId;
    const character = getCurrentCharacter();

    // Load messages for the new character
    state.messages = character.messages || [];

    // Update system prompt in settings
    const editableSystemPrompt = stripProtectedSystemPromptBlocks(character.systemPrompt);
    elements.systemPrompt.value = editableSystemPrompt;
    renderProtectedSystemPromptBlocks(
        elements.protectedSystemPromptBlock,
        state.settings.protectedImagePromptLanguage
    );
    state.settings.systemPrompt = editableSystemPrompt;
    state.settings.contextMessageCount = normalizeContextMessageCount(
        character.contextMessageCount ?? state.settings.contextMessageCount
    );
    elements.contextMessageCount.value = state.settings.contextMessageCount;

    renderCharactersList();
    renderCharactersWorkspace();
    updateCurrentCharacterUI();

    // Import and call renderMessages to refresh the chat view
    import('./messages.js').then((m) => {
        m.renderMessages();
        import('./memory.js').then((memory) => memory.renderMemoryPanel());
    });

    saveToLocalStorage();

    if (window.innerWidth < 1024) {
        import('./ui.js').then((ui) => ui.toggleSidebar(false));
    }
}

function clonePlainValue(value, fallback) {
    if (value == null) return fallback;

    try {
        return JSON.parse(JSON.stringify(value));
    } catch {
        return fallback;
    }
}

function buildBranchName(baseName) {
    const sourceName = String(baseName || 'Character').trim() || 'Character';
    const branchLabel = `${sourceName} (Branch)`;
    const existingNames = new Set(state.characters.map((character) => character?.name));

    if (!existingNames.has(branchLabel)) {
        return branchLabel;
    }

    let copyNumber = 2;
    while (existingNames.has(`${branchLabel} ${copyNumber}`)) {
        copyNumber += 1;
    }
    return `${branchLabel} ${copyNumber}`;
}

export function branchChatFromMessage(messageId) {
    const branchIndex = state.messages.findIndex(
        (message) => message?.id === messageId && message.role === 'assistant'
    );
    if (branchIndex === -1) {
        showToast('Assistant message not found for branching.', {
            type: 'error'
        });
        return null;
    }

    const sourceCharacter = getCurrentCharacter();
    const branchMessages = clonePlainValue(state.messages.slice(0, branchIndex + 1), []);
    const branchMessageIds = new Set(branchMessages.map((message) => message?.id).filter(Boolean));
    const branchId = `char_branch_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const branchName = buildBranchName(sourceCharacter.name);
    const branchCharacter = {
        ...clonePlainValue(sourceCharacter, {}),
        id: branchId,
        name: branchName,
        isDefault: false,
        messages: branchMessages,
        memorySnapshots: clonePlainValue(sourceCharacter.memorySnapshots, []),
        contextMessageCount: normalizeContextMessageCount(
            sourceCharacter.contextMessageCount ?? state.settings.contextMessageCount
        ),
        branchedFrom: {
            characterId: sourceCharacter.id || state.currentCharacterId || 'default',
            characterName: sourceCharacter.name || 'Character',
            messageId,
            createdAt: new Date().toISOString()
        },
        openrouterSessionId: null
    };

    state.characters.push(branchCharacter);

    if (Array.isArray(state.galleryImages)) {
        const copiedGalleryItems = state.galleryImages
            .filter(
                (item) =>
                    item?.characterId === sourceCharacter.id &&
                    item?.messageId &&
                    branchMessageIds.has(item.messageId)
            )
            .map((item) => ({
                ...clonePlainValue(item, {}),
                id: `gallery_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
                characterId: branchId,
                characterName: branchName,
                characterAvatar: branchCharacter.avatar || sourceCharacter.avatar || 'ðŸ¤–'
            }));

        if (copiedGalleryItems.length > 0) {
            state.galleryImages.unshift(...copiedGalleryItems);
        }
    }

    selectCharacter(branchId);
    showToast(`Branched chat into "${branchName}".`, {
        type: 'success'
    });

    return branchCharacter;
}

// Update current character UI elements
export function updateCurrentCharacterUI() {
    const character = getCurrentCharacter();
    elements.currentCharacterName.textContent = character.name;
    elements.welcomeAvatar.textContent = character.avatar;
    elements.typingAvatar.textContent = character.avatar;

    // Update welcome message with character name
    elements.welcomeMessage.innerHTML = `
        Welcome to <strong class="text-pink-400">EroChat</strong>! I'm <strong class="text-purple-400">${escapeHtml(character.name)}</strong>, ready for intimate conversations.
        Every response I give can be automatically visualized using your selected image provider.
    `;
}

// Delete a character
export async function deleteCharacter(charId) {
    const confirmed = await requestConfirmation('Delete this character?', {
        confirmLabel: 'Delete',
        type: 'error'
    });
    if (!confirmed) return false;

    state.characters = state.characters.filter((c) => c.id !== charId);

    // If we deleted the current character, switch to default
    if (state.currentCharacterId === charId) {
        selectCharacter('default');
    } else {
        renderCharactersList();
        renderCharactersWorkspace();
        saveToLocalStorage();
    }

    showToast('Character deleted.', {
        type: 'success'
    });

    return true;
}

export async function deleteEditingCharacter() {
    if (!editingCharacterId) return;

    const deleted = await deleteCharacter(editingCharacterId);
    if (deleted) {
        closeCharacterModal();
    }
}

// Edit a character
export function editCharacter(charId) {
    openCharacterModal(charId);
}

// Open character modal (for create or edit)
export function openCharacterModal(characterId = null) {
    editingCharacterId = characterId;
    setCharacterFormStatus('');

    if (characterId) {
        const character = state.characters.find((c) => c.id === characterId);
        if (character) {
            elements.modalTitle.textContent = 'Edit Character';
            elements.charName.value = character.name;
            elements.charAvatar.value = character.avatar;
            elements.charSystemPrompt.value = stripProtectedSystemPromptBlocks(
                character.systemPrompt
            );
            renderProtectedSystemPromptBlocks(
                elements.charProtectedSystemPromptBlock,
                state.settings.protectedImagePromptLanguage
            );
            elements.charDescription.value = character.description || '';
        }
    } else {
        elements.modalTitle.textContent = 'Create Character';
        elements.charName.value = '';
        elements.charAvatar.value = '🤖';
        elements.charDescription.value = '';
        elements.charSystemPrompt.value = '';
        renderProtectedSystemPromptBlocks(
            elements.charProtectedSystemPromptBlock,
            state.settings.protectedImagePromptLanguage
        );
    }

    const canDelete = Boolean(characterId && characterId !== 'default');
    elements.deleteCharBtn?.classList.toggle('hidden', !canDelete);

    elements.characterModal.classList.remove('hidden');
}

// Close character modal
export function closeCharacterModal() {
    elements.characterModal.classList.add('hidden');
    editingCharacterId = null;
    elements.deleteCharBtn?.classList.add('hidden');
    setCharacterFormStatus('');
}

// Save character (create or update)
export async function saveCharacter() {
    const name = elements.charName.value.trim();
    const avatar = elements.charAvatar.value.trim() || '🤖';
    const systemPrompt = stripProtectedSystemPromptBlocks(elements.charSystemPrompt.value);
    const description = elements.charDescription.value.trim();

    if (!name) {
        setCharacterFormStatus('Please enter a character name.', true);
        elements.charName.focus();
        return;
    }

    if (!description) {
        setCharacterFormStatus('Please enter a description / personality.', true);
        elements.charDescription.focus();
        return;
    }

    if (!systemPrompt) {
        setCharacterFormStatus('Please enter a system prompt.', true);
        elements.charSystemPrompt.focus();
        return;
    }

    if (editingCharacterId) {
        // Edit existing character
        const index = state.characters.findIndex((c) => c.id === editingCharacterId);
        if (index !== -1) {
            const updatedChar = {
                ...state.characters[index],
                name,
                avatar,
                systemPrompt,
                description
            };
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
            isDefault: false,
            messages: [],
            contextMessageCount: state.settings.contextMessageCount,
            memorySnapshots: [],
            openrouterSessionId: null
        };
        state.characters.push(newCharacter);
    }

    renderCharactersList();
    renderCharactersWorkspace();
    saveToLocalStorage();
    showToast(editingCharacterId ? 'Character updated.' : 'Character created.', {
        type: 'success'
    });
    closeCharacterModal();
}
