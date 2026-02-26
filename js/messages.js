import { state } from './state.js';
import { elements } from './dom.js';
import { getCurrentCharacter } from './characters.js';
import { generateId, escapeHtml, formatMessage } from './utils.js';
import { scrollToBottom } from './ui.js';
import { generateImage, generateVideoFromImage } from './api-image.js';
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
            addAIMessageToUI(msg.content, msg.imageUrl, msg.id, false, msg.videoUrl || null);
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
                    <p class="text-gray-100 leading-relaxed chat-formatted-text">${formatMessage(escapeHtml(content), 'user')}</p>
                </div>
            </div>
        </div>
    `;
    
    elements.chatContainer.appendChild(messageDiv);
    scrollToBottom();
    return messageId;
}

// Add AI message to UI
export function addAIMessageToUI(content, imageUrl = null, id = null, animate = true, videoUrl = null) {
    const character = getCurrentCharacter();
    const messageId = id || generateId();
    const messageDiv = document.createElement('div');
    messageDiv.className = 'message-ai max-w-6xl';
    messageDiv.id = messageId;
    
    // Remove the image prompt block from display
    const displayContent = content.replace(/---IMAGE_PROMPT START---[\s\S]*?---IMAGE_PROMPT END---/, '').trim();
    
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
                    <p class="text-gray-300 leading-relaxed chat-formatted-text">${formatMessage(escapeHtml(displayContent), 'ai')}</p>
                </div>
                ${imageSection}
            </div>
        </div>
        ${hasImage ? `
        <div class="flex gap-2 mt-2 ml-12 pl-1">
            <button onclick="window.regenerateImage('${messageId}')" class="text-xs text-gray-500 hover:text-pink-400 flex items-center gap-1 transition-colors">
                <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path>
                </svg>
                Regenerate Image
            </button>
            ${videoUrl ? '' : `
            <button onclick="window.generateVideoForMessage('${messageId}')" class="generate-video-btn text-xs text-gray-500 hover:text-cyan-400 flex items-center gap-1 transition-colors">
                <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14m-6 4h2a2 2 0 002-2V8a2 2 0 00-2-2H9a2 2 0 00-2 2v8a2 2 0 002 2z"></path>
                </svg>
                Generate Video
            </button>
            `}
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
            imageContainer.innerHTML = `
                <img src="${imageUrl}" alt="Generated" class="chat-image-preview w-full h-full object-cover rounded-xl shadow-2xl fade-in cursor-zoom-in" style="max-height: 400px;">
            `;
        }

        const actions = messageDiv.querySelector('.flex.gap-2.mt-2.ml-12.pl-1');
        if (actions && !actions.querySelector('.generate-video-btn')) {
            const videoButton = document.createElement('button');
            videoButton.className = 'generate-video-btn text-xs text-gray-500 hover:text-cyan-400 flex items-center gap-1 transition-colors';
            videoButton.onclick = () => window.generateVideoForMessage(messageId);
            videoButton.innerHTML = `
                <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14m-6 4h2a2 2 0 002-2V8a2 2 0 00-2-2H9a2 2 0 00-2 2v8a2 2 0 002 2z"></path>
                </svg>
                Generate Video
            `;
            actions.appendChild(videoButton);
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
export function addImageToGallery(imageUrl, source = 'chat', messageId = null) {
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
        createdAt: new Date().toISOString()
    };

    state.galleryImages.unshift(galleryItem);
    saveToLocalStorage();
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
        addImageToGallery(imageUrl, 'regenerate', messageId);
        
        // Update message in state
        message.imageUrl = imageUrl;
        message.videoUrl = null;
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

export async function generateVideoForMessage(messageId) {
    const message = state.messages.find(m => m.id === messageId);
    if (!message) return;
    if (!message.imageUrl) {
        alert('No generated image found for this message.');
        return;
    }
    if (message.videoUrl) {
        return;
    }

    const messageDiv = document.getElementById(messageId);
    const imageContainer = messageDiv?.querySelector('.image-container');
    const videoButton = messageDiv?.querySelector('.generate-video-btn');

    if (videoButton) {
        videoButton.disabled = true;
        videoButton.classList.add('opacity-60', 'cursor-not-allowed');
        videoButton.textContent = 'Generating video...';
    }

    if (imageContainer) {
        imageContainer.innerHTML = `
            <div class="bg-gray-900/50 rounded-xl p-8 flex items-center justify-center min-h-[200px]">
                <div class="text-center">
                    <div class="spinner mx-auto mb-3"></div>
                    <p class="text-gray-400 text-sm">Generating video...</p>
                </div>
            </div>
        `;
    }

    try {
        const videoUrl = await generateVideoFromImage(message.imageUrl);
        updateAIMessageVideo(messageId, videoUrl);
        message.videoUrl = videoUrl;
        addVideoToGallery(videoUrl, 'chat-video', messageId);
        saveToLocalStorage();
    } catch (error) {
        console.error('Failed to generate video:', error);
        if (imageContainer) {
            imageContainer.innerHTML = `
                <img src="${message.imageUrl}" alt="Generated" class="w-full h-full object-cover rounded-xl shadow-2xl" style="max-height: 400px;">
            `;
        }
        if (videoButton) {
            videoButton.disabled = false;
            videoButton.classList.remove('opacity-60', 'cursor-not-allowed');
            videoButton.innerHTML = `
                <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14m-6 4h2a2 2 0 002-2V8a2 2 0 00-2-2H9a2 2 0 00-2 2v8a2 2 0 002 2z"></path>
                </svg>
                Generate Video
            `;
            alert(`Failed to generate video: ${error.message}`);
        }
    }
}
