import { state } from './state.js';
import { elements } from './dom.js';
import { getCurrentCharacter, getCharacterById, saveGeneratedImageToCurrentCharacter } from './characters.js';
import { generateId, escapeHtml, formatMessage } from './utils.js';
import { scrollToBottom } from './ui.js';
import { generateImage } from './api-swarmui.js';
import { saveToLocalStorage } from './storage.js';

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
                            Welcome to <strong class="text-pink-400">EroChat + SwarmUI</strong>! I'm <strong class="text-purple-400">${escapeHtml(character.name)}</strong>, ready for intimate conversations.
                            Every response I give will be automatically visualized using your local SwarmUI instance.
                        </p>
                        <p class="text-gray-400 text-sm mt-3">
                            Please configure your settings in the sidebar to get started. Make sure SwarmUI is running locally!
                        </p>
                    </div>
                </div>
            </div>
        `;
        elements.chatContainer.appendChild(welcomeDiv);
        return;
    }

    state.messages.forEach(msg => {
        if (msg.role === 'user') {
            addUserMessageToUI(msg.content, msg.id, false);
        } else {
            addAIMessageToUI(msg.content, msg.imageUrl, msg.id, false);
        }
    });

    scrollToBottom();
}

// Add user message to UI
export function addUserMessageToUI(content, id = null, animate = true) {
    const messageId = id || generateId();
    const messageDiv = document.createElement('div');
    messageDiv.className = 'message-user flex justify-end max-w-3xl ml-auto';
    messageDiv.id = messageId;

    messageDiv.innerHTML = `
        <div class="flex items-start gap-3 flex-row-reverse">
            <div class="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center flex-shrink-0">
                <span class="text-xl">😈</span>
            </div>
            <div class="flex-1">
                <div class="bg-gradient-to-r from-purple-900/80 to-blue-900/80 border border-purple-700/50 rounded-2xl rounded-tr-none px-5 py-4">
                    <p class="text-gray-100 leading-relaxed">${formatMessage(escapeHtml(content))}</p>
                </div>
            </div>
        </div>
    `;

    elements.chatContainer.appendChild(messageDiv);
    scrollToBottom();
    return messageId;
}

function imageContentHtml(imageUrl) {
    return `
        <div class="image-container h-full image-clickable" onclick="window.openImageZoom('${imageUrl}')">
            <img src="${imageUrl}" alt="Generated" class="w-full h-full object-cover rounded-xl shadow-2xl" style="max-height: 400px;">
        </div>
    `;
}

// Add AI message to UI
export function addAIMessageToUI(content, imageUrl = null, id = null, animate = true) {
    const character = getCurrentCharacter();
    const messageId = id || generateId();
    const messageDiv = document.createElement('div');
    messageDiv.className = 'message-ai max-w-6xl';
    messageDiv.id = messageId;

    // Remove the image prompt block from display
    const displayContent = content.replace(/---IMAGE_PROMPT START---[\s\S]*?---IMAGE_PROMPT END---/, '').trim();

    let imageSection = '';
    if (imageUrl) {
        imageSection = `
            <div class="w-full lg:w-1/3 flex-shrink-0">
                ${imageContentHtml(imageUrl)}
            </div>
        `;
    } else if (state.settings.enableImageGeneration !== false && content.includes('---IMAGE_PROMPT')) {
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

    messageDiv.innerHTML = `
        <div class="flex items-start gap-3">
            <div class="w-10 h-10 rounded-full bg-gradient-to-br from-purple-500 to-red-500 flex items-center justify-center flex-shrink-0">
                <span class="text-xl">${character.avatar}</span>
            </div>
            <div class="flex-1 flex gap-4 ${hasImage ? 'flex-col lg:flex-row' : 'flex-col'}">
                <div class="glass rounded-2xl rounded-tl-none px-5 py-4 ${hasImage ? 'w-full lg:w-2/3' : 'w-full'}">
                    <p class="text-gray-300 leading-relaxed">${formatMessage(escapeHtml(displayContent))}</p>
                </div>
                ${imageSection}
            </div>
        </div>
        ${hasImage ? `
        <div class="flex gap-4 mt-2 ml-12 pl-1">
            <button onclick="window.regenerateImage('${messageId}')" class="text-xs text-gray-500 hover:text-pink-400 flex items-center gap-1 transition-colors">
                <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path>
                </svg>
                Regenerate Image
            </button>
            ${imageUrl ? `
            <button onclick="window.openImageZoom('${imageUrl}')" class="text-xs text-gray-500 hover:text-blue-300 flex items-center gap-1 transition-colors">
                <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 10l4.55-4.55M19 5h-4m4 0v4M9 14l-4.55 4.55M5 19h4m-4 0v-4"></path>
                </svg>
                Zoom
            </button>
            ` : ''}
        </div>
        ` : ''}
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
            imageContainer.outerHTML = imageContentHtml(imageUrl);
        }

        const controls = messageDiv.querySelector('.flex.gap-4.mt-2');
        if (controls && !controls.innerHTML.includes('Zoom')) {
            controls.insertAdjacentHTML('beforeend', `
                <button onclick="window.openImageZoom('${imageUrl}')" class="text-xs text-gray-500 hover:text-blue-300 flex items-center gap-1 transition-colors">
                    <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 10l4.55-4.55M19 5h-4m4 0v4M9 14l-4.55 4.55M5 19h4m-4 0v-4"></path>
                    </svg>
                    Zoom
                </button>
            `);
        }
    }
}

export function openImageZoom(imageUrl) {
    if (!imageUrl) return;
    elements.zoomedImage.src = imageUrl;
    elements.imageZoomModal.classList.remove('hidden');
}

export function closeImageZoom() {
    elements.imageZoomModal.classList.add('hidden');
    elements.zoomedImage.src = '';
}

export function openCharacterGallery(characterId) {
    const character = getCharacterById(characterId);
    if (!character) return;

    const images = character.generatedImages || [];
    elements.galleryTitle.textContent = `${character.name} - Gallery`;

    if (images.length === 0) {
        elements.characterGalleryGrid.innerHTML = `
            <div class="col-span-full text-center py-10 text-gray-400">
                No generated images yet for this character.
            </div>
        `;
    } else {
        elements.characterGalleryGrid.innerHTML = images.map((url, index) => `
            <button class="image-container image-clickable p-0" onclick="window.openImageZoom('${url}')" aria-label="Open gallery image ${index + 1}">
                <img src="${url}" alt="${escapeHtml(character.name)} gallery image ${index + 1}" class="w-full h-56 object-cover rounded-xl shadow-xl">
            </button>
        `).join('');
    }

    elements.characterGalleryModal.classList.remove('hidden');
}

export function closeCharacterGallery() {
    elements.characterGalleryModal.classList.add('hidden');
}

// Regenerate image for a message
export async function regenerateImage(messageId) {
    const message = state.messages.find(m => m.id === messageId);
    if (!message) return;

    const promptMatch = message.content.match(/---IMAGE_PROMPT START---([\s\S]*?)---IMAGE_PROMPT END---/);
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
        const imageUrl = await generateImage(imagePrompt);
        updateAIMessageImage(messageId, imageUrl);

        // Update message in state
        message.imageUrl = imageUrl;
        saveGeneratedImageToCurrentCharacter(imageUrl);
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
