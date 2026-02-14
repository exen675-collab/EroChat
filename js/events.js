import { state } from './state.js';
import { elements } from './dom.js';
import { toggleSidebar, autoResizeTextarea } from './ui.js';
import { openCharacterModal, closeCharacterModal, saveCharacter, generateThumbnail, generateSystemPromptOnDemand } from './characters.js';
import { fetchSwarmModels } from './api-swarmui.js';
import { fetchOpenRouterModels, setupModelSearch } from './api-openrouter.js';
import { saveToLocalStorage } from './storage.js';
import { renderMessages } from './messages.js';
import { sendMessage } from './main.js';

// Setup all event listeners
export function setupEventListeners() {
    // Sidebar toggle
    elements.toggleSettings.addEventListener('click', toggleSidebar);
    elements.overlay.addEventListener('click', toggleSidebar);

    // Textarea auto-resize
    elements.messageInput.addEventListener('input', autoResizeTextarea);

    // Send message on Enter (not Shift+Enter)
    elements.messageInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });

    // Send button
    elements.sendBtn.addEventListener('click', sendMessage);

    // Fetch models buttons
    elements.fetchModelsBtn.addEventListener('click', fetchSwarmModels);
    elements.fetchOpenRouterModelsBtn.addEventListener('click', fetchOpenRouterModels);

    // Setup model search functionality
    setupModelSearch();

    // Character modal events
    elements.addCharacterBtn.addEventListener('click', () => openCharacterModal());
    elements.closeModalBtn.addEventListener('click', closeCharacterModal);
    elements.cancelCharBtn.addEventListener('click', closeCharacterModal);
    elements.saveCharBtn.addEventListener('click', saveCharacter);
    elements.generateThumbnailBtn.addEventListener('click', generateThumbnail);
    elements.generatePromptBtn.addEventListener('click', generateSystemPromptOnDemand);

    // Close modal on overlay click
    elements.characterModal.addEventListener('click', (e) => {
        if (e.target === elements.characterModal) {
            closeCharacterModal();
        }
    });

    // Save settings
    elements.saveSettingsBtn.addEventListener('click', () => {
        state.settings = {
            openrouterKey: elements.openrouterKey.value,
            openrouterModel: elements.openrouterModel.value,
            swarmUrl: elements.swarmUrl.value,
            swarmModel: elements.swarmModel.value,
            imgWidth: parseInt(elements.imgWidth.value),
            imgHeight: parseInt(elements.imgHeight.value),
            steps: parseInt(elements.steps.value),
            cfgScale: parseFloat(elements.cfgScale.value),
            sampler: elements.sampler.value,
            systemPrompt: elements.systemPrompt.value
        };

        // Update current character's system prompt if edited
        if (state.currentCharacterId !== 'default') {
            const charIndex = state.characters.findIndex(c => c.id === state.currentCharacterId);
            if (charIndex !== -1) {
                state.characters[charIndex].systemPrompt = elements.systemPrompt.value;
            }
        }

        saveToLocalStorage();
        alert('Settings saved!');
    });

    // Clear chat
    elements.clearChatBtn.addEventListener('click', () => {
        if (confirm('Are you sure you want to clear the chat? This will remove all messages.')) {
            state.messages = [];
            renderMessages();
            saveToLocalStorage();
        }
    });

    // Range slider updates
    elements.steps.addEventListener('input', (e) => {
        elements.stepsValue.textContent = e.target.value;
    });

    elements.cfgScale.addEventListener('input', (e) => {
        elements.cfgValue.textContent = e.target.value;
    });
}
