import { state } from './state.js';
import { elements } from './dom.js';
import { getCurrentCharacter } from './characters.js';
import {
    generateId,
    escapeHtml,
    formatMessage,
    getAssistantVisibleText,
    getContextMessageIdSet
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

function getActiveContextMessageIds() {
    return getContextMessageIdSet(state.messages, state.settings.contextMessageCount);
}

function getContextBadgeMarkup(messageId) {
    const isInContext = getActiveContextMessageIds().has(messageId);
    const badgeClass = isInContext
        ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
        : 'border-gray-700/60 bg-black/20 text-gray-500';
    const badgeText = isInContext ? 'In context' : 'Outside context';

    return `
        <span class="message-context-badge inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[11px] font-medium ${badgeClass}"
            data-message-id="${messageId}" data-in-context="${isInContext ? 'true' : 'false'}">
            <span class="w-1.5 h-1.5 rounded-full ${isInContext ? 'bg-emerald-400' : 'bg-gray-500'}"></span>
            ${badgeText}
        </span>
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

function getMessageActionsMarkup(messageId, options = {}) {
    const {
        align = 'left',
        showRegenerate = false,
        showGenerateVideo = false,
        showTts = false,
        showEdit = false,
        isEdited = false
    } = options;

    const alignmentClass = align === 'right' ? 'flex-col items-end' : 'justify-between';
    const actionButtons = [];

    if (showEdit) {
        actionButtons.push(getEditMessageButtonMarkup(messageId));
    }

    if (showRegenerate) {
        actionButtons.push(`
            <button onclick="window.regenerateImage('${messageId}')" class="regenerate-image-btn text-xs text-gray-500 hover:text-pink-400 flex items-center gap-1 transition-colors">
                <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path>
                </svg>
                Regenerate Image
            </button>
        `);
    }

    if (showGenerateVideo) {
        actionButtons.push(`
            <button onclick="window.generateVideoForMessage('${messageId}')" class="generate-video-btn text-xs text-gray-500 hover:text-cyan-400 flex items-center gap-1 transition-colors">
                <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14m-6 4h2a2 2 0 002-2V8a2 2 0 00-2-2H9a2 2 0 00-2 2v8a2 2 0 002 2z"></path>
                </svg>
                Generate Video
            </button>
        `);
    }

    if (showTts) {
        actionButtons.push(getTtsActionButtonMarkup(messageId));
    }

    actionButtons.push(getRemoveMessageButtonMarkup(messageId));

    return `
        <div class="message-actions flex flex-wrap gap-2 mt-2 ${align === 'right' ? '' : 'items-center ml-12 pl-1'} ${alignmentClass}">
            ${
                align === 'right'
                    ? `
                ${getContextBadgeMarkup(messageId)}
                <div class="flex flex-wrap items-center gap-2">
                    ${actionButtons.join('')}
                </div>
            `
                    : `
                <div class="flex flex-wrap items-center gap-2">
                    ${getContextBadgeMarkup(messageId)}
                    ${
                        isEdited
                            ? '<span class="message-edited-badge">Edited</span>'
                            : ''
                    }
                </div>
                <div class="flex flex-wrap items-center gap-2">
                    ${actionButtons.join('')}
                </div>
            `
            }
        </div>
    `;
}

export function refreshMessageContextIndicators() {
    const contextMessageIds = getActiveContextMessageIds();

    elements.chatContainer.querySelectorAll('.message-context-badge').forEach((badge) => {
        const messageId = badge.getAttribute('data-message-id');
        const isInContext = contextMessageIds.has(messageId);
        badge.setAttribute('data-in-context', isInContext ? 'true' : 'false');
        badge.className = `message-context-badge inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[11px] font-medium ${
            isInContext
                ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                : 'border-gray-700/60 bg-black/20 text-gray-500'
        }`;
        badge.innerHTML = `
            <span class="w-1.5 h-1.5 rounded-full ${isInContext ? 'bg-emerald-400' : 'bg-gray-500'}"></span>
            ${isInContext ? 'In context' : 'Outside context'}
        `;
    });
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
                            Open Workspace for quick controls, or Settings for advanced configuration.
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

    let imageSection = '';
    if (videoUrl) {
        imageSection = `
            <div class="w-full lg:w-1/3 flex-shrink-0">
                <div class="image-container h-full">
                    <video src="${videoUrl}" autoplay loop muted playsinline class="chat-video-preview w-full h-full object-cover rounded-xl shadow-2xl cursor-zoom-in" style="max-height: 400px;"></video>
                </div>
            </div>
        `;
    } else if (imageUrl) {
        imageSection = `
            <div class="w-full lg:w-1/3 flex-shrink-0">
                <div class="image-container h-full">
                    <img src="${imageUrl}" alt="Generated" class="chat-image-preview w-full h-full object-cover rounded-xl shadow-2xl cursor-zoom-in" style="max-height: 400px;">
                </div>
            </div>
        `;
    } else if (
        state.settings.enableImageGeneration !== false &&
        content.includes('---IMAGE_PROMPT')
    ) {
        // Image is being generated
        imageSection = `
            <div class="w-full lg:w-1/3 flex-shrink-0">
                <div class="image-container bg-gray-900/50 rounded-xl p-8 flex items-center justify-center h-full" style="min-height: 300px;">
                    <div class="text-center">
                        <div class="spinner mx-auto mb-3"></div>
                        <p class="text-gray-400 text-sm">Generating image...</p>
                    </div>
                </div>
            </div>
        `;
    }

    const hasImage = imageSection !== '';
    const showRegenerate = Boolean(imageUrl || videoUrl);
    const showGenerateVideo = false;
    const showTts = false;
    const isEdited = Boolean(editedAt);

    messageDiv.innerHTML = `
        <div class="flex items-start gap-3">
            <div class="w-10 h-10 rounded-full bg-gradient-to-br from-purple-500 to-red-500 flex items-center justify-center flex-shrink-0">
                <span class="text-xl">${character.avatar}</span>
            </div>
            <div class="flex-1 flex gap-4 ${hasImage ? 'flex-col lg:flex-row' : 'flex-col'}">
                <div class="glass rounded-2xl rounded-tl-none px-5 py-4 ${hasImage ? 'w-full lg:w-2/3' : 'w-full'}">
                    <p class="text-gray-300 leading-relaxed chat-formatted-text">${formatMessage(escapeHtml(displayContent), 'ai')}</p>
                </div>
                ${imageSection}
            </div>
        </div>
        ${getMessageActionsMarkup(messageId, {
            align: 'left',
            showRegenerate,
            showGenerateVideo,
            showTts,
            showEdit: true,
            isEdited
        })}
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
            imageContainer.innerHTML = `
                <img src="${imageUrl}" alt="Generated" class="chat-image-preview w-full h-full object-cover rounded-xl shadow-2xl fade-in cursor-zoom-in" style="max-height: 400px;">
            `;
        }

        const actions = messageDiv.querySelector('.message-actions');
        if (actions) {
            const buttonGroup = actions.querySelector('div:last-child') || actions;
            const removeButton = buttonGroup.querySelector('.remove-message-btn');

            if (!buttonGroup.querySelector('.regenerate-image-btn')) {
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
                buttonGroup.insertBefore(regenerateButton, removeButton);
            }
        }
    }
}

export function updateAIMessageVideo(messageId, videoUrl) {
    const messageDiv = document.getElementById(messageId);
    if (!messageDiv) return;

    const imageContainer = messageDiv.querySelector('.image-container');
    if (imageContainer) {
        imageContainer.innerHTML = `
            <video src="${videoUrl}" autoplay loop muted playsinline class="chat-video-preview w-full h-full object-cover rounded-xl shadow-2xl fade-in cursor-zoom-in" style="max-height: 400px;"></video>
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
        providerModel:
            typeof metadata.providerModel === 'string' ? metadata.providerModel : '',
        metadata:
            metadata.metadata && typeof metadata.metadata === 'object' && !Array.isArray(metadata.metadata)
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
        alert('No image prompt found in this message.');
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
            provider === 'comfy' ? state.settings.comfyModel || '' : state.settings.swarmModel || '';
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

export function removeMessageFromContext(messageId) {
    const message = state.messages.find((item) => item.id === messageId);
    if (!message) return;

    const confirmed = window.confirm('Remove this message from chat history and future context?');
    if (!confirmed) return;

    state.messages = state.messages.filter((item) => item.id !== messageId);
    saveToLocalStorage();
    renderMessages();
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
