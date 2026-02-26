import { state } from './state.js';
import { elements } from './dom.js';
import * as ui from './ui.js';
import { defaultCharacter } from './config.js';
import { normalizeBaseUrl } from './utils.js';
import { openCharacterModal, closeCharacterModal, saveCharacter, generateThumbnail, generateSystemPromptOnDemand, renderCharactersList } from './characters.js';
import { fetchSwarmModels } from './api-swarmui.js';
import { fetchOpenRouterModels, setupModelSearch } from './api-openrouter.js';
import { saveToLocalStorage } from './storage.js';
import { renderMessages } from './messages.js';
import { sendMessage } from './main.js';

// Setup all event listeners
export function setupEventListeners() {
    const toggleSidebar = ui.toggleSidebar;
    const autoResizeTextarea = ui.autoResizeTextarea;
    const renderGallery = ui.renderGallery;
    const closeGallery = ui.closeGallery;
    const openGallery = ui.openGallery;
    const openLightboxImage = (imageUrl) => {
        if (!imageUrl) return;
        elements.lightboxVideo.pause();
        elements.lightboxVideo.classList.add('hidden');
        elements.lightboxVideo.src = '';
        elements.lightboxImage.classList.remove('hidden');
        elements.lightboxImage.src = imageUrl;
        elements.galleryLightbox.classList.remove('hidden');
        elements.galleryLightbox.classList.add('flex');
    };
    const openLightboxVideo = (videoUrl) => {
        if (!videoUrl) return;
        elements.lightboxImage.classList.add('hidden');
        elements.lightboxImage.src = '';
        elements.lightboxVideo.classList.remove('hidden');
        elements.lightboxVideo.src = videoUrl;
        elements.galleryLightbox.classList.remove('hidden');
        elements.galleryLightbox.classList.add('flex');
    };
    const closeLightbox = () => {
        elements.galleryLightbox.classList.remove('flex');
        elements.galleryLightbox.classList.add('hidden');
        elements.lightboxImage.src = '';
        elements.lightboxImage.classList.remove('hidden');
        elements.lightboxVideo.pause();
        elements.lightboxVideo.src = '';
        elements.lightboxVideo.classList.add('hidden');
    };
    const applyCharacterThumbnail = (characterId, imageUrl) => {
        if (!characterId || !imageUrl) return false;

        const index = state.characters.findIndex(c => c.id === characterId);
        if (index !== -1) {
            state.characters[index].thumbnail = imageUrl;
        } else if (characterId === 'default') {
            state.characters.unshift({ ...defaultCharacter, thumbnail: imageUrl, messages: [...(state.messages || [])] });
        } else {
            return false;
        }

        saveToLocalStorage();
        renderCharactersList();
        return true;
    };

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

    // Chat media lightbox (assistant generated images/videos)
    elements.chatContainer.addEventListener('click', (e) => {
        const image = e.target.closest('.chat-image-preview');
        if (image) {
            openLightboxImage(image.getAttribute('src'));
            return;
        }

        const video = e.target.closest('.chat-video-preview');
        if (video) {
            openLightboxVideo(video.getAttribute('src'));
        }
    });

    // Gallery
    elements.openGalleryBtn.addEventListener('click', openGallery);
    elements.logoutBtn.addEventListener('click', async () => {
        try {
            await fetch('/api/auth/logout', { method: 'POST' });
        } catch (error) {
            console.error('Logout request failed:', error);
        } finally {
            window.location.href = '/';
        }
    });
    elements.backToChatBtn.addEventListener('click', closeGallery);
    elements.galleryCharacterFilter.addEventListener('change', (e) => {
        state.galleryFilterCharacterId = e.target.value || 'all';
        renderGallery();
        saveToLocalStorage();
    });
    elements.galleryGrid.addEventListener('click', (e) => {
        const btn = e.target.closest('.set-thumbnail-btn');
        if (btn) {
            const imageUrl = btn.getAttribute('data-image-url');
            const targetCharacterId = elements.galleryThumbnailCharacter.value;

            if (!targetCharacterId) {
                alert('Please choose a character first.');
                return;
            }

            const ok = applyCharacterThumbnail(targetCharacterId, imageUrl);
            if (!ok) {
                alert('Failed to set thumbnail for selected character.');
                return;
            }

            alert('Thumbnail updated successfully!');
            return;
        }

        const image = e.target.closest('.gallery-image');
        if (image) {
            openLightboxImage(image.getAttribute('data-full-image') || image.getAttribute('src'));
            return;
        }

        const video = e.target.closest('.gallery-video');
        if (video) {
            openLightboxVideo(video.getAttribute('data-full-video') || video.getAttribute('src'));
        }
    });
    elements.closeLightboxBtn.addEventListener('click', closeLightbox);
    elements.galleryLightbox.addEventListener('click', (e) => {
        if (e.target === elements.galleryLightbox) {
            closeLightbox();
        }
    });
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && !elements.galleryLightbox.classList.contains('hidden')) {
            closeLightbox();
        }
    });

    // Fetch models buttons
    elements.fetchModelsBtn.addEventListener('click', fetchSwarmModels);
    elements.fetchOpenRouterModelsBtn.addEventListener('click', fetchOpenRouterModels);

    // Setup model search functionality
    setupModelSearch();

    // Persist model selections immediately when changed
    elements.openrouterModel.addEventListener('change', () => {
        state.settings.openrouterModel = elements.openrouterModel.value;
        saveToLocalStorage();
    });

    elements.textProvider.addEventListener('change', () => {
        state.settings.textProvider = elements.textProvider.value;
        saveToLocalStorage();
    });

    elements.swarmModel.addEventListener('change', () => {
        state.settings.swarmModel = elements.swarmModel.value;
        saveToLocalStorage();
    });

    elements.imageProvider.addEventListener('change', () => {
        state.settings.imageProvider = elements.imageProvider.value;
        saveToLocalStorage();
    });

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


    window.addEventListener('resize', () => {
        if (window.innerWidth >= 1024) {
            elements.settingsPanel.classList.remove('-translate-x-full');
            elements.overlay.classList.add('hidden');
        }
    });

    // Save settings
    elements.saveSettingsBtn.addEventListener('click', () => {
        state.settings = {
            textProvider: elements.textProvider.value,
            openrouterKey: elements.openrouterKey.value,
            openrouterModel: elements.openrouterModel.value,
            swarmUrl: normalizeBaseUrl(elements.swarmUrl.value),
            swarmModel: elements.swarmModel.value,
            imageProvider: elements.imageProvider.value,
            enableImageGeneration: elements.enableImageGeneration.checked,
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
