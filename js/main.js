import { state } from './state.js';
import { elements } from './dom.js';
import { loadFromLocalStorage, saveToLocalStorage } from './storage.js';
import { getCurrentCharacter } from './characters.js';
import { addUserMessageToUI, addAIMessageToUI, updateAIMessageImage, addImageToGallery, generateVideoForMessage } from './messages.js';
import { generateImage } from './api-image.js';
import { sendChatRequest } from './api-openrouter.js';
import { toggleSidebar, scrollToBottom } from './ui.js';
import { escapeHtml } from './utils.js';
import { setupEventListeners } from './events.js';
import { regenerateImage } from './messages.js';
import { selectCharacter, deleteCharacter, editCharacter } from './characters.js';
import { fetchOpenRouterModels } from './api-openrouter.js';
import { fetchSwarmModels } from './api-swarmui.js';
import { fetchCreditsSummary } from './api-grok.js';

async function loadCurrentUser() {
    try {
        const response = await fetch('/api/auth/me', { cache: 'no-store' });
        if (!response.ok) {
            return null;
        }
        const data = await response.json();
        return data?.user || null;
    } catch (error) {
        console.error('Failed to load current user:', error);
        return null;
    }
}

function updateCurrentUserUI() {
    if (!elements.currentUsername || !elements.currentCredits) return;
    if (!state.currentUser?.username) {
        elements.currentUsername.textContent = 'Unknown user';
        elements.currentCredits.textContent = '--';
        return;
    }
    elements.currentUsername.textContent = `@${state.currentUser.username}`;
    if (Number.isFinite(state.currentUser.credits)) {
        elements.currentCredits.textContent = String(state.currentUser.credits);
    } else {
        elements.currentCredits.textContent = '--';
    }
}

// Main send message function
export async function sendMessage() {
    const content = elements.messageInput.value.trim();
    if (!content || state.isGenerating) return;

    // Validate settings
    const textProvider = elements.textProvider.value || state.settings.textProvider || 'premium';
    const imageProvider = elements.imageProvider.value || state.settings.imageProvider || 'local';

    if (textProvider !== 'premium' && !elements.openrouterKey.value) {
        alert('Please enter your OpenRouter API key in settings.');
        toggleSidebar();
        return;
    }

    if (textProvider !== 'premium' && !elements.openrouterModel.value) {
        alert('Please select an OpenRouter model in settings.');
        toggleSidebar();
        return;
    }

    if (state.settings.enableImageGeneration !== false && imageProvider === 'local' && !elements.swarmModel.value) {
        alert('Please select a SwarmUI model in settings or disable image generation.');
        toggleSidebar();
        return;
    }

    // Clear input
    elements.messageInput.value = '';
    elements.messageInput.style.height = 'auto';

    // Add user message
    const userMessageId = addUserMessageToUI(content);
    state.messages.push({ id: userMessageId, role: 'user', content });
    saveToLocalStorage();

    // Show typing indicator
    elements.typingIndicator.classList.remove('hidden');
    state.isGenerating = true;
    elements.sendBtn.disabled = true;
    elements.sendBtn.classList.add('opacity-60', 'cursor-not-allowed');

    try {
        // Get current character's system prompt
        const character = getCurrentCharacter();

        // Prepare messages for API
        const apiMessages = [
            { role: 'system', content: character.systemPrompt },
            ...state.messages.slice(-20).map(m => ({ role: m.role, content: m.content }))
        ];

        // Call OpenRouter
        const aiResponse = await sendChatRequest(apiMessages);

        // Hide typing indicator
        elements.typingIndicator.classList.add('hidden');

        // Extract image prompt
        const promptMatch = aiResponse.match(/---IMAGE_PROMPT START---([\s\S]*?)---IMAGE_PROMPT END---/);
        const imagePrompt = promptMatch ? promptMatch[1].trim() : null;

        // Add AI message to UI (without image initially)
        const aiMessageId = addAIMessageToUI(aiResponse, null);
        state.messages.push({ id: aiMessageId, role: 'assistant', content: aiResponse, imageUrl: null, videoUrl: null });
        saveToLocalStorage();

        // Generate image if prompt exists
        if (state.settings.enableImageGeneration !== false && imagePrompt) {
            try {
                const imageUrl = await generateImage(imagePrompt);
                updateAIMessageImage(aiMessageId, imageUrl);
                addImageToGallery(imageUrl, 'chat', aiMessageId);

                // Update message in state
                const msgIndex = state.messages.findIndex(m => m.id === aiMessageId);
                if (msgIndex !== -1) {
                    state.messages[msgIndex].imageUrl = imageUrl;
                    saveToLocalStorage();
                }
            } catch (imgError) {
                console.error('Image generation failed:', imgError);
                // Update UI to show error
                const messageDiv = document.getElementById(aiMessageId);
                if (messageDiv) {
                    const imageContainer = messageDiv.querySelector('.image-container');
                    if (imageContainer) {
                        imageContainer.innerHTML = `
                            <div class="text-center text-red-400">
                                <p>Failed to generate image</p>
                                <p class="text-xs text-gray-500 mt-1">${imgError.message}</p>
                            </div>
                        `;
                    }
                }
            }
        }

    } catch (error) {
        console.error('Error:', error);
        elements.typingIndicator.classList.add('hidden');

        // Show error message
        const errorDiv = document.createElement('div');
        errorDiv.className = 'message-ai max-w-3xl';
        errorDiv.innerHTML = `
            <div class="flex items-start gap-3">
                <div class="w-10 h-10 rounded-full bg-red-900/50 flex items-center justify-center flex-shrink-0">
                    <span class="text-xl">⚠️</span>
                </div>
                <div class="flex-1">
                    <div class="bg-red-900/30 border border-red-700/50 rounded-2xl rounded-tl-none px-5 py-4">
                        <p class="text-red-300">Error: ${escapeHtml(error.message)}</p>
                    </div>
                </div>
            </div>
        `;
        elements.chatContainer.appendChild(errorDiv);
        scrollToBottom();

    } finally {
        state.isGenerating = false;
        elements.sendBtn.disabled = false;
        elements.sendBtn.classList.remove('opacity-60', 'cursor-not-allowed');
    }
}

// Auto-fetch models if keys are present
async function autoFetchModels() {
    console.log('Checking for auto-fetch...');

    if (elements.swarmUrl.value) {
        console.log('Auto-fetching SwarmUI models...');
        try {
            await fetchSwarmModels(true);
        } catch (e) {
            console.warn('Auto-fetch SwarmUI models failed:', e);
        }
    }

    if (elements.openrouterKey.value) {
        console.log('Auto-fetching OpenRouter models...');
        try {
            await fetchOpenRouterModels(true);
        } catch (e) {
            console.warn('Auto-fetch OpenRouter models failed:', e);
        }
    }

}

// Initialize application
async function init() {
    // Setup event listeners
    setupEventListeners();

    // Resolve authenticated user for per-user local storage namespace
    state.currentUser = await loadCurrentUser();
    if (!state.currentUser) {
        window.location.href = '/';
        return;
    }
    updateCurrentUserUI();
    try {
        await fetchCreditsSummary(true);
    } catch (error) {
        console.warn('Failed to fetch credits summary:', error);
    }

    // Load data from localStorage
    loadFromLocalStorage();

    // Expose functions globally for inline event handlers
    window.regenerateImage = regenerateImage;
    window.generateVideoForMessage = generateVideoForMessage;
    window.selectCharacter = selectCharacter;
    window.deleteCharacter = deleteCharacter;
    window.editCharacter = editCharacter;

    // Focus input on load
    elements.messageInput.focus();

    // Trigger auto-fetching
    autoFetchModels();

    console.log('EroChat initialized successfully!');
}

// Start the app when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
