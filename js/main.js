import { state } from './state.js';
import { elements } from './dom.js';
import { loadFromLocalStorage, saveToLocalStorage } from './storage.js';
import { getCurrentCharacter } from './characters.js';
import {
    addUserMessageToUI,
    addAIMessageToUI,
    updateAIMessageImage,
    addImageToGallery,
    refreshMessageContextIndicators,
    removeMessageFromContext
} from './messages.js';
import { generateImage } from './api-image.js';
import { sendChatRequest } from './api-openrouter.js';
import {
    toggleAdvancedSettings,
    scrollToBottom,
    setCurrentView,
    showChatRequestPreview
} from './ui.js';
import { escapeHtml, generateId, normalizeImageProvider } from './utils.js';
import { persistImageForStorage } from './media.js';
import { setupEventListeners } from './events.js';
import { editAssistantMessage, regenerateImage } from './messages.js';
import { selectCharacter, deleteCharacter, editCharacter } from './characters.js';
import { fetchComfyModels } from './api-comfyui.js';
import { fetchOpenRouterModels } from './api-openrouter.js';
import { fetchSwarmModels } from './api-swarmui.js';
import { syncAdminPanelVisibility, fetchAdminUsers } from './admin.js';
import { initGenerator, refreshGeneratorView } from './generator.js';
import { buildChatRequestPreview, canPreviewChatRequest } from './chat-request.js';
import { fetchSuggestions, renderSuggestions, clearSuggestions } from './suggestions.js';
import { recordAssistantReply, recordGeneratedMedia, recordUserMessage } from './stats.js';

export function updateRequestPreviewButtonState() {
    if (!elements.previewRequestBtn) return;

    const shouldEnable = canPreviewChatRequest(elements.messageInput.value, state.isGenerating);
    elements.previewRequestBtn.disabled = !shouldEnable;
    elements.previewRequestBtn.classList.toggle('opacity-60', !shouldEnable);
    elements.previewRequestBtn.classList.toggle('cursor-not-allowed', !shouldEnable);
}

export function buildCurrentChatRequestPreview(draftMessage = elements.messageInput.value.trim()) {
    const character = getCurrentCharacter();

    return buildChatRequestPreview({
        textProvider: elements.textProvider.value || state.settings.textProvider || 'premium',
        draftMessage,
        systemPrompt: character?.systemPrompt || '',
        historyMessages: state.messages,
        contextMessageCount: state.settings.contextMessageCount,
        openrouterKey: elements.openrouterKey.value,
        openrouterModel: elements.openrouterModel.value,
        currentUrl: window.location.href
    });
}

export function openRequestPreview() {
    const draftMessage = elements.messageInput.value.trim();
    if (!canPreviewChatRequest(draftMessage, state.isGenerating)) {
        return;
    }

    showChatRequestPreview(buildCurrentChatRequestPreview(draftMessage));
}

function normalizeViewFromHash(hashValue) {
    const normalized = String(hashValue || '')
        .replace(/^#/, '')
        .trim()
        .toLowerCase();
    return ['chat', 'generator', 'gallery', 'stats'].includes(normalized) ? normalized : null;
}

function syncViewFromHash() {
    const hashView = normalizeViewFromHash(window.location.hash);
    const nextView = hashView || state.currentView || 'chat';
    setCurrentView(nextView, {
        syncHash: !hashView,
        persist: true
    });

    if (nextView === 'generator') {
        refreshGeneratorView();
    }
}

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

    const adminSuffix = state.currentUser.isAdmin ? ' (admin)' : '';
    elements.currentUsername.textContent = `@${state.currentUser.username}${adminSuffix}`;
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

    const textProvider = elements.textProvider.value || state.settings.textProvider || 'premium';
    const imageProvider = normalizeImageProvider(
        elements.imageProvider.value || state.settings.imageProvider || 'swarm'
    );

    if (textProvider !== 'premium' && !elements.openrouterKey.value) {
        alert('Please enter your OpenRouter API key in settings.');
        toggleAdvancedSettings(true);
        return;
    }

    if (textProvider !== 'premium' && !elements.openrouterModel.value) {
        alert('Please select an OpenRouter model in settings.');
        toggleAdvancedSettings(true);
        return;
    }

    if (
        state.settings.enableImageGeneration !== false &&
        imageProvider === 'swarm' &&
        !elements.swarmModel.value
    ) {
        alert('Please select a SwarmUI model in settings or disable image generation.');
        toggleAdvancedSettings(true);
        return;
    }

    if (
        state.settings.enableImageGeneration !== false &&
        imageProvider === 'comfy' &&
        !elements.comfyModel.value
    ) {
        alert('Please select a ComfyUI checkpoint in settings or disable image generation.');
        toggleAdvancedSettings(true);
        return;
    }

    const requestPreview = buildCurrentChatRequestPreview(content);
    const createdAt = new Date().toISOString();

    elements.messageInput.value = '';
    elements.messageInput.style.height = 'auto';
    updateRequestPreviewButtonState();
    clearSuggestions();

    const userMessageId = generateId();
    state.messages.push({ id: userMessageId, role: 'user', content, createdAt });
    recordUserMessage({ content, createdAt });
    addUserMessageToUI(content, userMessageId);
    refreshMessageContextIndicators();
    saveToLocalStorage();

    elements.typingIndicator.classList.remove('hidden');
    state.isGenerating = true;
    elements.sendBtn.disabled = true;
    elements.sendBtn.classList.add('opacity-60', 'cursor-not-allowed');
    updateRequestPreviewButtonState();

    try {
        const aiResponse = await sendChatRequest(requestPreview);
        elements.typingIndicator.classList.add('hidden');

        const promptMatch = aiResponse.match(
            /---IMAGE_PROMPT START---([\s\S]*?)---IMAGE_PROMPT END---/
        );
        const imagePrompt = promptMatch ? promptMatch[1].trim() : null;

        const aiCreatedAt = new Date().toISOString();
        const aiMessageId = generateId();
        state.messages.push({
            id: aiMessageId,
            role: 'assistant',
            content: aiResponse,
            imageUrl: null,
            videoUrl: null,
            createdAt: aiCreatedAt
        });
        recordAssistantReply({
            textProvider,
            model: elements.openrouterModel.value || state.settings.openrouterModel || '',
            createdAt: aiCreatedAt
        });
        addAIMessageToUI(aiResponse, null, aiMessageId);
        refreshMessageContextIndicators();
        saveToLocalStorage();

        // Fetch writing suggestions in the background (non-blocking)
        fetchSuggestions().then(renderSuggestions).catch(() => {});

        if (state.settings.enableImageGeneration !== false && imagePrompt) {
            try {
                const generatedImageUrl = await generateImage(imagePrompt);
                const imageUrl = await persistImageForStorage(generatedImageUrl);
                const imageProviderModel =
                    imageProvider === 'comfy'
                        ? state.settings.comfyModel || ''
                        : state.settings.swarmModel || '';
                updateAIMessageImage(aiMessageId, imageUrl);

                const msgIndex = state.messages.findIndex((m) => m.id === aiMessageId);
                if (msgIndex !== -1) {
                    state.messages[msgIndex].imageUrl = imageUrl;
                }
                addImageToGallery(imageUrl, 'chat', aiMessageId, {
                    prompt: imagePrompt,
                    provider: imageProvider,
                    providerModel: imageProviderModel
                });
                recordGeneratedMedia({
                    provider: imageProvider,
                    prompt: imagePrompt,
                    source: 'chat'
                });
                saveToLocalStorage();
            } catch (imgError) {
                console.error('Image generation failed:', imgError);
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
        updateRequestPreviewButtonState();
    }
}

async function autoFetchModels() {
    const imageProvider = normalizeImageProvider(
        elements.imageProvider.value || state.settings.imageProvider || 'swarm'
    );

    if (imageProvider === 'swarm' && elements.swarmUrl.value) {
        try {
            await fetchSwarmModels(true);
        } catch (e) {
            console.warn('Auto-fetch SwarmUI models failed:', e);
        }
    }

    if (imageProvider === 'comfy' && elements.comfyUrl.value) {
        try {
            await fetchComfyModels(true);
        } catch (e) {
            console.warn('Auto-fetch ComfyUI checkpoints failed:', e);
        }
    }

    if (elements.openrouterKey.value) {
        try {
            await fetchOpenRouterModels(true);
        } catch (e) {
            console.warn('Auto-fetch OpenRouter models failed:', e);
        }
    }
}

// Initialize application
async function init() {
    setupEventListeners();
    updateRequestPreviewButtonState();

    state.currentUser = await loadCurrentUser();
    if (!state.currentUser) {
        window.location.href = '/';
        return;
    }

    updateCurrentUserUI();
    syncAdminPanelVisibility();

    if (state.currentUser.isAdmin) {
        try {
            await fetchAdminUsers(true);
        } catch (error) {
            console.warn('Failed to fetch admin users:', error);
        }
    }

    window.regenerateImage = regenerateImage;
    window.removeMessageFromContext = removeMessageFromContext;
    window.editAssistantMessage = editAssistantMessage;
    window.selectCharacter = selectCharacter;
    window.deleteCharacter = deleteCharacter;
    window.editCharacter = editCharacter;

    loadFromLocalStorage();
    await initGenerator();

    syncViewFromHash();
    window.addEventListener('hashchange', syncViewFromHash);

    elements.messageInput.focus();
    autoFetchModels();
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
