import { state } from './state.js';
import { elements } from './dom.js';
import { loadFromLocalStorage, saveToLocalStorage } from './storage.js';
import { getCurrentCharacter } from './characters.js';
import { addUserMessageToUI, addAIMessageToUI, updateAIMessageImage } from './messages.js';
import { generateImage } from './api-swarmui.js';
import { sendChatRequest } from './api-openrouter.js';
import { toggleSidebar, scrollToBottom } from './ui.js';
import { escapeHtml } from './utils.js';
import { setupEventListeners } from './events.js';
import { regenerateImage } from './messages.js';
import { selectCharacter, deleteCharacter, editCharacter } from './characters.js';

// Main send message function
export async function sendMessage() {
    const content = elements.messageInput.value.trim();
    if (!content || state.isGenerating) return;

    // Validate settings
    if (!elements.openrouterKey.value) {
        alert('Please enter your OpenRouter API key in settings.');
        toggleSidebar();
        return;
    }

    if (!elements.swarmModel.value) {
        alert('Please select a SwarmUI model in settings.');
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
        state.messages.push({ id: aiMessageId, role: 'assistant', content: aiResponse, imageUrl: null });
        saveToLocalStorage();

        // Generate image if prompt exists
        if (imagePrompt) {
            try {
                const imageUrl = await generateImage(imagePrompt);
                updateAIMessageImage(aiMessageId, imageUrl);

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
    }
}

// Initialize application
function init() {
    // Setup event listeners
    setupEventListeners();

    // Load data from localStorage
    loadFromLocalStorage();

    // Expose functions globally for inline event handlers
    window.regenerateImage = regenerateImage;
    window.selectCharacter = selectCharacter;
    window.deleteCharacter = deleteCharacter;
    window.editCharacter = editCharacter;

    // Focus input on load
    elements.messageInput.focus();

    console.log('EroChat initialized successfully!');
}

// Start the app when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
