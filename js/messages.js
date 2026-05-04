import { state } from './state.js';
import { elements } from './dom.js';
import { getCurrentCharacter } from './characters.js';
import {
    generateId,
    escapeHtml,
    formatMessage,
    getAssistantVisibleText,
    getActiveRawMessages
} from './utils.js';
import {
    scrollToBottom,
    openEditMessageModal,
    renderGallery,
    renderGalleryCharacterFilter,
    renderGalleryThumbnailCharacterSelect
} from './ui.js';
import { generateImage } from './api-image.js';
import { saveToLocalStorage } from './storage.js';
import { persistImageForStorage } from './media.js';
import { recordGeneratedMedia } from './stats.js';
import { requestConfirmation, showToast } from './notifications.js';

function getActiveContextMessageIds() {
    return new Set(
        getActiveRawMessages(state.messages)
            .map((message) => message?.id)
            .filter(Boolean)
    );
}

function getContextDividerMarkup() {
    return `
        <div class="message-context-divider" role="separator" aria-label="Messages below are in context">
            <span class="message-context-divider-line"></span>
            <span class="message-context-divider-label">
                <span class="message-context-divider-dot"></span>
                In context
            </span>
            <span class="message-context-divider-note">Messages above are outside context</span>
            <span class="message-context-divider-line"></span>
        </div>
    `;
}

function getRemoveMessageButtonMarkup(messageId) {
    return `
        <button onclick="window.removeMessageFromContext('${messageId}')"
            class="remove-message-btn text-xs text-gray-500 hover:text-red-400 flex items-center gap-1 transition-colors">
            <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                    d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path>
            </svg>
            Remove Message
        </button>
    `;
}

function getEditMessageButtonMarkup(messageId) {
    return `
        <button onclick="window.editAssistantMessage('${messageId}')"
            class="edit-message-btn text-xs text-gray-500 hover:text-amber-300 flex items-center gap-1 transition-colors"
            type="button">
            <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                    d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path>
            </svg>
            Edit Message
        </button>
    `;
}

function getRegenerateImageButtonMarkup(messageId) {
    return `
        <button onclick="window.regenerateImage('${messageId}')" class="regenerate-image-btn text-xs text-gray-500 hover:text-pink-400 flex items-center gap-1 transition-colors">
            <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path>
            </svg>
            Regenerate Image
        </button>
    `;
}

function getGenerateVideoButtonMarkup(messageId) {
    return `
        <button onclick="window.generateVideoForMessage('${messageId}')" class="generate-video-btn text-xs text-gray-500 hover:text-cyan-400 flex items-center gap-1 transition-colors">
            <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14m-6 4h2a2 2 0 002-2V8a2 2 0 00-2-2H9a2 2 0 00-2 2v8a2 2 0 002 2z"></path>
            </svg>
            Generate Video
        </button>
    `;
}

function getMessageActionsMarkup(messageId, options = {}) {
    const {
        align = 'left',
        showRegenerate = false,
        showGenerateVideo = false,
        showEdit = false,
        isEdited = false
    } = options;

    const layoutClass = align === 'right' ? 'flex-col items-end' : 'items-center justify-between';
    const spacingClass = align === 'right' ? '' : 'ml-12 pl-1';
    const actionButtons = [];

    if (showEdit) {
        actionButtons.push(getEditMessageButtonMarkup(messageId));
    }

    if (showRegenerate) {
        actionButtons.push(getRegenerateImageButtonMarkup(messageId));
    }

    if (showGenerateVideo) {
        actionButtons.push(getGenerateVideoButtonMarkup(messageId));
    }

    actionButtons.push(getRemoveMessageButtonMarkup(messageId));

    return `
        <div class="message-actions flex flex-wrap gap-2 mt-2 ${spacingClass} ${layoutClass}">
            ${
                align === 'right'
                    ? `
                <div class="flex flex-wrap items-center justify-end gap-2">
                    ${actionButtons.join('')}
                </div>
            `
                    : `
                <div class="flex flex-wrap items-center gap-2">
                    ${isEdited ? '<span class="message-edited-badge">Edited</span>' : ''}
                </div>
                <div class="flex flex-wrap items-center gap-2">
                    ${actionButtons.join('')}
                </div>
            `
            }
        </div>
    `;
}

function getAssistantTextActionsMarkup(messageId, options = {}) {
    const { isEdited = false } = options;
    const actionButtons = [];

    actionButtons.push(getEditMessageButtonMarkup(messageId));
    actionButtons.push(getRemoveMessageButtonMarkup(messageId));

    return `
        <div class="message-actions chat-text-actions flex flex-wrap items-center justify-between gap-2 mt-2">
            <div class="flex flex-wrap items-center gap-2">
                ${isEdited ? '<span class="message-edited-badge">Edited</span>' : ''}
            </div>
            <div class="flex flex-wrap items-center justify-end gap-2">
                ${actionButtons.join('')}
            </div>
        </div>
    `;
}

function getAssistantMediaActionsMarkup(messageId, options = {}) {
    const { showRegenerate = false, showGenerateVideo = false, renderEmpty = false } = options;
    const actionButtons = [];

    if (showRegenerate) {
        actionButtons.push(getRegenerateImageButtonMarkup(messageId));
    }

    if (showGenerateVideo) {
        actionButtons.push(getGenerateVideoButtonMarkup(messageId));
    }

    if (actionButtons.length === 0 && !renderEmpty) {
        return '';
    }

    return `
        <div class="message-actions chat-media-actions flex flex-wrap items-center justify-end gap-2 mt-2">
            ${actionButtons.join('')}
        </div>
    `;
}

export function refreshMessageContextIndicators() {
    const contextMessageIds = getActiveContextMessageIds();
    const messageElements = Array.from(
        elements.chatContainer.querySelectorAll('.message-ai[id], .message-user[id]')
    );

    elements.chatContainer.querySelectorAll('.message-context-divider').forEach((divider) => {
        divider.remove();
    });

    messageElements.forEach((messageElement) => {
        const isInContext = contextMessageIds.has(messageElement.id);
        const message = state.messages.find((item) => item.id === messageElement.id);
        const isArchived = message?.archivedFromModelContext === true;
        messageElement.dataset.inContext = isInContext ? 'true' : 'false';
        messageElement.dataset.archivedContext = isArchived ? 'true' : 'false';
        messageElement.classList.toggle('message-in-context', isInContext);
        messageElement.classList.toggle('message-outside-context', !isInContext);
        messageElement.classList.toggle('message-archived-context', isArchived);
    });

    const firstInContextIndex = messageElements.findIndex((messageElement) =>
        contextMessageIds.has(messageElement.id)
    );
    const hasOutsideContextBefore =
        firstInContextIndex > 0 &&
        messageElements
            .slice(0, firstInContextIndex)
            .some((messageElement) => !contextMessageIds.has(messageElement.id));

    if (hasOutsideContextBefore) {
        messageElements[firstInContextIndex].insertAdjacentHTML(
            'beforebegin',
            getContextDividerMarkup()
        );
    }
}

// Render all messages
export function renderMessages() {
    elements.chatContainer.innerHTML = '';

    const character = getCurrentCharacter();

    // Show welcome message if no messages
    if (state.messages.length === 0) {
        const welcomeDiv = document.createElement('div');
        welcomeDiv.className = 'message-ai max-w-3xl';
        welcomeDiv.innerHTML = `
            <div class="flex items-start gap-3">
                <div class="w-10 h-10 rounded-full bg-gradient-to-br from-purple-500 to-red-500 flex items-center justify-center flex-shrink-0">
                    <span class="text-xl">${character.avatar}</span>
                </div>
                <div class="flex-1">
                    <div class="glass rounded-2xl rounded-tl-none px-5 py-4">
                        <p class="text-gray-300 leading-relaxed">
                            Welcome to <strong class="text-pink-400">EroChat</strong>! I'm <strong class="text-purple-400">${escapeHtml(character.name)}</strong>, ready for intimate conversations.
                            Every response I give can be automatically visualized using your selected image provider.
                        </p>
                        <p class="text-gray-400 text-sm mt-3">
                            Choose a character from the Characters tab, or open Settings for advanced configuration.
                        </p>
                    </div>
                </div>
            </div>
        `;
        elements.chatContainer.appendChild(welcomeDiv);
        return;
    }

    state.messages.forEach((msg) => {
        if (msg.role === 'user') {
            addUserMessageToUI(msg.content, msg.id);
        } else {
            addAIMessageToUI(msg.content, msg.imageUrl, msg.id, msg.videoUrl || null, msg.editedAt);
        }
    });

    refreshMessageContextIndicators();
    scrollToBottom();
}

// Add user message to UI
export function addUserMessageToUI(content, id = null) {
    const messageId = id || generateId();
    const messageDiv = document.createElement('div');
    messageDiv.className = 'message-user flex justify-end max-w-3xl ml-auto';
    messageDiv.id = messageId;

    messageDiv.innerHTML = `
        <div class="flex items-start gap-3 flex-row-reverse">
            <div class="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center flex-shrink-0">
                <span class="text-xl">😈</span>
            </div>
            <div class="flex-1 flex flex-col items-end">
                <div class="bg-gradient-to-r from-purple-900/80 to-blue-900/80 border border-purple-700/50 rounded-2xl rounded-tr-none px-5 py-4">
                    <p class="text-gray-100 leading-relaxed chat-formatted-text">${formatMessage(escapeHtml(content), 'user')}</p>
                </div>
                ${getMessageActionsMarkup(messageId, { align: 'right' })}
            </div>
        </div>
    `;

    elements.chatContainer.appendChild(messageDiv);
    scrollToBottom();
    return messageId;
}

// Add AI message to UI
export function addAIMessageToUI(
    content,
    imageUrl = null,
    id = null,
    videoUrl = null,
    editedAt = null
) {
    const character = getCurrentCharacter();
    const messageId = id || generateId();
    const messageDiv = document.createElement('div');
    messageDiv.className = 'message-ai max-w-6xl';
    messageDiv.id = messageId;

    const displayContent = getAssistantVisibleText(content);
    const showRegenerate = Boolean(imageUrl || videoUrl);
    const showGenerateVideo = false;
    const isEdited = Boolean(editedAt);

    let imageSection = '';
    if (videoUrl) {
        imageSection = `
            <div class="chat-media-wrap">
                <div class="image-container chat-media-frame">
                    <video src="${videoUrl}" autoplay loop muted playsinline class="chat-video-preview chat-media-preview fade-in cursor-zoom-in"></video>
                </div>
                ${getAssistantMediaActionsMarkup(messageId, { showRegenerate, showGenerateVideo, renderEmpty: true })}
            </div>
        `;
    } else if (imageUrl) {
        imageSection = `
            <div class="chat-media-wrap">
                <div class="image-container chat-media-frame">
                    <img src="${imageUrl}" alt="Generated" class="chat-image-preview chat-media-preview cursor-zoom-in">
                </div>
                ${getAssistantMediaActionsMarkup(messageId, { showRegenerate, showGenerateVideo, renderEmpty: true })}
            </div>
        `;
    } else if (
        state.settings.enableImageGeneration !== false &&
        content.includes('---IMAGE_PROMPT')
    ) {
        // Image is being generated
        imageSection = `
            <div class="chat-media-wrap">
                <div class="image-container chat-media-frame bg-gray-900/50 rounded-xl p-8 flex items-center justify-center">
                    <div class="text-center">
                        <div class="spinner mx-auto mb-3"></div>
                        <p class="text-gray-400 text-sm">Generating image...</p>
                    </div>
                </div>
                ${getAssistantMediaActionsMarkup(messageId, { showRegenerate, showGenerateVideo, renderEmpty: true })}
            </div>
        `;
    }

    const hasImage = imageSection !== '';

    messageDiv.innerHTML = `
        <div class="flex items-start gap-3">
            <div class="w-10 h-10 rounded-full bg-gradient-to-br from-purple-500 to-red-500 flex items-center justify-center flex-shrink-0">
                <span class="text-xl">${character.avatar}</span>
            </div>
            <div class="flex-1 flex gap-3 min-w-0 ${hasImage ? 'chat-message-with-media flex-col lg:flex-row' : 'flex-col'}">
                <div class="${hasImage ? 'chat-media-message' : 'w-full'}">
                    <div class="glass rounded-2xl rounded-tl-none px-5 py-4">
                        <p class="text-gray-300 leading-relaxed chat-formatted-text">${formatMessage(escapeHtml(displayContent), 'ai')}</p>
                    </div>
                    ${getAssistantTextActionsMarkup(messageId, { isEdited })}
                </div>
                ${imageSection}
            </div>
        </div>
    `;

    elements.chatContainer.appendChild(messageDiv);
    scrollToBottom();
    return messageId;
}

// Update AI message with generated image
export function updateAIMessageImage(messageId, imageUrl) {
    const messageDiv = document.getElementById(messageId);
    if (messageDiv) {
        const imageContainer = messageDiv.querySelector('.image-container');
        if (imageContainer) {
            imageContainer.classList.add('chat-media-frame');
            imageContainer.innerHTML = `
                <img src="${imageUrl}" alt="Generated" class="chat-image-preview chat-media-preview fade-in cursor-zoom-in">
            `;
        }

        const actions = messageDiv.querySelector('.chat-media-actions');
        if (actions) {
            if (!actions.querySelector('.regenerate-image-btn')) {
                const regenerateButton = document.createElement('button');
                regenerateButton.className =
                    'regenerate-image-btn text-xs text-gray-500 hover:text-pink-400 flex items-center gap-1 transition-colors';
                regenerateButton.onclick = () => window.regenerateImage(messageId);
                regenerateButton.innerHTML = `
                    <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path>
                    </svg>
                    Regenerate Image
                `;
                actions.prepend(regenerateButton);
            }
        }
    }
}

export function updateAIMessageVideo(messageId, videoUrl) {
    const messageDiv = document.getElementById(messageId);
    if (!messageDiv) return;

    const imageContainer = messageDiv.querySelector('.image-container');
    if (imageContainer) {
        imageContainer.classList.add('chat-media-frame');
        imageContainer.innerHTML = `
            <video src="${videoUrl}" autoplay loop muted playsinline class="chat-video-preview chat-media-preview fade-in cursor-zoom-in"></video>
        `;
    }

    const videoButton = messageDiv.querySelector('.generate-video-btn');
    if (videoButton) {
        videoButton.remove();
    }
}

// Add generated image to persistent gallery store
export function addImageToGallery(imageUrl, source = 'chat', messageId = null, metadata = {}) {
    if (!imageUrl) return;

    const character = getCurrentCharacter();
    const galleryItem = {
        id: generateId(),
        imageUrl,
        characterId: state.currentCharacterId || 'default',
        characterName: character.name,
        characterAvatar: character.avatar,
        source,
        messageId,
        prompt: typeof metadata.prompt === 'string' ? metadata.prompt : '',
        provider: typeof metadata.provider === 'string' ? metadata.provider : '',
        providerModel: typeof metadata.providerModel === 'string' ? metadata.providerModel : '',
        metadata:
            metadata.metadata &&
            typeof metadata.metadata === 'object' &&
            !Array.isArray(metadata.metadata)
                ? metadata.metadata
                : {},
        createdAt:
            typeof metadata.createdAt === 'string' && metadata.createdAt
                ? metadata.createdAt
                : new Date().toISOString()
    };

    state.galleryImages.unshift(galleryItem);
    saveToLocalStorage();
    renderGalleryCharacterFilter();
    renderGalleryThumbnailCharacterSelect();
    renderGallery();
}

export function addVideoToGallery(videoUrl, source = 'chat-video', messageId = null) {
    if (!videoUrl) return;

    const character = getCurrentCharacter();
    const galleryItem = {
        id: generateId(),
        videoUrl,
        characterId: state.currentCharacterId || 'default',
        characterName: character.name,
        characterAvatar: character.avatar,
        source,
        messageId,
        createdAt: new Date().toISOString()
    };

    state.galleryImages.unshift(galleryItem);
    saveToLocalStorage();
    renderGalleryCharacterFilter();
    renderGalleryThumbnailCharacterSelect();
    renderGallery();
}

// Regenerate image for a message
export async function regenerateImage(messageId) {
    const message = state.messages.find((m) => m.id === messageId);
    if (!message) return;

    const promptMatch = message.content.match(
        /---IMAGE_PROMPT START---([\s\S]*?)---IMAGE_PROMPT END---/
    );
    if (!promptMatch) {
        showToast('No image prompt found in this message.', {
            type: 'warning'
        });
        return;
    }

    const imagePrompt = promptMatch[1].trim();

    // Update UI to show loading
    const messageDiv = document.getElementById(messageId);
    if (messageDiv) {
        const existingImage = messageDiv.querySelector('.image-container');
        if (existingImage) {
            existingImage.innerHTML = `
                <div class="bg-gray-900/50 rounded-xl p-8 flex items-center justify-center min-h-[200px]">
                    <div class="text-center">
                        <div class="spinner mx-auto mb-3"></div>
                        <p class="text-gray-400 text-sm">Regenerating image...</p>
                    </div>
                </div>
            `;
        }
    }

    try {
        const generatedImageUrl = await generateImage(imagePrompt);
        const imageUrl = await persistImageForStorage(generatedImageUrl);
        updateAIMessageImage(messageId, imageUrl);

        // Update message in state
        message.imageUrl = imageUrl;
        message.videoUrl = null;
        const provider = state.settings.imageProvider;
        const providerModel =
            provider === 'comfy'
                ? state.settings.comfyModel || ''
                : state.settings.swarmModel || '';
        addImageToGallery(imageUrl, 'regenerate', messageId, {
            prompt: imagePrompt,
            provider,
            providerModel
        });
        recordGeneratedMedia({
            provider: state.settings.imageProvider,
            prompt: imagePrompt,
            source: 'chat'
        });
        saveToLocalStorage();
    } catch (error) {
        console.error('Failed to regenerate image:', error);
        if (messageDiv) {
            const imageContainer = messageDiv.querySelector('.image-container');
            if (imageContainer) {
                imageContainer.innerHTML = `
                    <div class="text-center text-red-400 p-4">
                        <p>Failed to regenerate image</p>
                        <p class="text-xs text-gray-500 mt-1">${error.message}</p>
                    </div>
                `;
            }
        }
    }
}

export async function removeMessageFromContext(messageId) {
    const message = state.messages.find((item) => item.id === messageId);
    if (!message) return;

    const confirmed = await requestConfirmation(
        'Remove this message from chat history and future context?',
        {
            confirmLabel: 'Remove',
            type: 'warning'
        }
    );
    if (!confirmed) return;

    state.messages = state.messages.filter((item) => item.id !== messageId);
    saveToLocalStorage();
    renderMessages();
    showToast('Message removed from context.', {
        type: 'success'
    });
}

export function editAssistantMessage(messageId) {
    const message = state.messages.find(
        (item) => item.id === messageId && item.role === 'assistant'
    );
    if (!message) return;

    openEditMessageModal(message);
}

export function saveEditedAssistantMessage(messageId, nextContent) {
    const message = state.messages.find(
        (item) => item.id === messageId && item.role === 'assistant'
    );
    if (!message) {
        throw new Error('Assistant message not found.');
    }

    const content = String(nextContent ?? '');
    if (!content.trim()) {
        throw new Error('Assistant message content cannot be empty.');
    }

    message.content = content;
    message.editedAt = new Date().toISOString();
    saveToLocalStorage();
    renderMessages();
}
