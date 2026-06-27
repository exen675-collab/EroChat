// @ts-nocheck
import { state } from './state.js';
import { elements } from './dom.js';
import * as ui from './ui.js';
import { defaultCharacter } from './config.js';
import { normalizeBaseUrl, normalizeContextMessageCount, normalizeImageProvider } from './utils.js';
import {
    openCharacterModal,
    closeCharacterModal,
    saveCharacter,
    generateThumbnail,
    generateSystemPromptOnDemand,
    renderCharactersList,
    selectCharacter,
    editCharacter,
    deleteEditingCharacter
} from './characters.js';
import { fetchComfyModels } from './api-comfyui.js';
import { fetchNanoGptModels } from './api-nanogpt.js';
import { fetchSwarmModels } from './api-swarmui.js';
import {
    fetchOpenRouterModels,
    getOpenRouterModelLabel,
    renderOpenRouterQuickModelSelect,
    selectOpenRouterModel,
    setupModelSearch
} from './api-openrouter.js';
import { fetchAdminUsers, handleAdminUsersListClick } from './admin.js';
import { saveToLocalStorage } from './storage.js';
import { renderMessages, saveEditedAssistantMessage } from './messages.js';
import {
    openRequestPreview,
    sendMessage,
    updateCurrentUserUI,
    updateRequestPreviewButtonState
} from './legacy-main.js';
import { importCharacterCardFile } from './character-import.js';
import { clearSuggestions } from './suggestions.js';
import {
    closeTextUpgradeMenu,
    selectTextUpgradeMode,
    toggleTextUpgradeMenu,
    upgradeCurrentDraft
} from './text-upgrade.js';
import { requestConfirmation, showToast } from './notifications.js';
import {
    renderProtectedSystemPromptBlocks,
    stripProtectedSystemPromptBlocks
} from './static-prompts.js';
import {
    closeMemoryViewerModal,
    handleMemoryPanelClick,
    renderMemoryPanel,
    setCurrentChatContextLimit
} from './memory.js';
import { resetCurrentOpenRouterSessionId } from './openrouter-session.js';

function closeSettingsPanel() {
    ui.toggleSidebar(false);
}

function normalizeFavoriteOpenRouterModels(value) {
    return Array.isArray(value)
        ? Array.from(
              new Set(value.map((model) => String(model || '').trim()).filter(Boolean))
          ).slice(0, 12)
        : [];
}

function setProfileStatus(message = '', isError = false) {
    if (!elements.profileStatus) return;
    elements.profileStatus.textContent = message;
    elements.profileStatus.classList.toggle('text-red-300', isError);
    elements.profileStatus.classList.toggle('text-gray-400', !isError);
}

function renderFavoriteModelsList() {
    if (!elements.favoriteModelsList) return;

    state.settings.favoriteOpenRouterModels = normalizeFavoriteOpenRouterModels(
        state.settings.favoriteOpenRouterModels
    );

    const models = state.settings.favoriteOpenRouterModels;
    if (models.length === 0) {
        elements.favoriteModelsList.innerHTML =
            '<p class="profile-empty-copy">No favorite models yet.</p>';
        return;
    }

    elements.favoriteModelsList.innerHTML = '';
    models.forEach((model) => {
        const row = document.createElement('div');
        row.className = 'favorite-model-row';

        const label = document.createElement('span');
        label.textContent = getOpenRouterModelLabel(model);
        row.appendChild(label);

        const removeButton = document.createElement('button');
        removeButton.type = 'button';
        removeButton.className = 'favorite-model-remove';
        removeButton.dataset.model = model;
        removeButton.textContent = 'Remove';
        row.appendChild(removeButton);

        elements.favoriteModelsList.appendChild(row);
    });
}

function openProfileSettings() {
    if (!elements.profileSettingsModal) return;

    elements.profileUsernameInput.value = state.currentUser?.username || '';
    elements.profileCurrentPasswordInput.value = '';
    elements.profileNewPasswordInput.value = '';
    elements.profileConfirmPasswordInput.value = '';
    setProfileStatus('Manage account details and quick access models.');
    renderFavoriteModelsList();
    elements.profileSettingsModal.classList.remove('hidden');
    elements.profileSettingsModal.classList.add('flex');
    elements.profileUsernameInput.focus();
}

function closeProfileSettings() {
    if (!elements.profileSettingsModal) return;
    elements.profileSettingsModal.classList.remove('flex');
    elements.profileSettingsModal.classList.add('hidden');
}

function addSelectedFavoriteModel() {
    const model = String(
        elements.openrouterModel?.value || state.settings.openrouterModel || ''
    ).trim();
    if (!model) {
        setProfileStatus('Select an OpenRouter model first.', true);
        return;
    }

    state.settings.favoriteOpenRouterModels = normalizeFavoriteOpenRouterModels([
        model,
        ...(state.settings.favoriteOpenRouterModels || [])
    ]);
    saveToLocalStorage();
    renderFavoriteModelsList();
    renderOpenRouterQuickModelSelect();
    setProfileStatus('Favorite model added.');
}

async function saveProfileSettings() {
    const username = String(elements.profileUsernameInput?.value || '').trim();
    const currentPassword = String(elements.profileCurrentPasswordInput?.value || '');
    const newPassword = String(elements.profileNewPasswordInput?.value || '');
    const confirmPassword = String(elements.profileConfirmPasswordInput?.value || '');

    if (!/^[a-zA-Z0-9_-]{3,24}$/.test(username)) {
        setProfileStatus('Username must be 3-24 chars: letters, numbers, _ or -.', true);
        return;
    }

    if (newPassword || confirmPassword) {
        if (newPassword !== confirmPassword) {
            setProfileStatus('New passwords do not match.', true);
            return;
        }
        if (newPassword.length < 6 || newPassword.length > 128) {
            setProfileStatus('Password must be between 6 and 128 characters.', true);
            return;
        }
        if (!currentPassword) {
            setProfileStatus('Enter your current password to change it.', true);
            return;
        }
    }

    const originalLabel = elements.saveProfileSettingsBtn.textContent;
    elements.saveProfileSettingsBtn.disabled = true;
    elements.saveProfileSettingsBtn.textContent = 'Saving...';
    setProfileStatus('Saving profile...');

    try {
        const response = await fetch('/api/auth/profile', {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                username,
                currentPassword,
                newPassword
            })
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
            throw new Error(data.error || 'Failed to update profile.');
        }

        state.currentUser = data.user;
        updateCurrentUserUI();
        setProfileStatus('Profile updated.');
        showToast('Profile updated.', { type: 'success' });
        elements.profileCurrentPasswordInput.value = '';
        elements.profileNewPasswordInput.value = '';
        elements.profileConfirmPasswordInput.value = '';
    } catch (error) {
        setProfileStatus(error.message || 'Failed to update profile.', true);
    } finally {
        elements.saveProfileSettingsBtn.disabled = false;
        elements.saveProfileSettingsBtn.textContent = originalLabel;
    }
}

// Setup all event listeners
export function setupEventListeners() {
    ui.ensureAdvancedSettingsModalMounted();

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

        const index = state.characters.findIndex((c) => c.id === characterId);
        if (index !== -1) {
            state.characters[index].thumbnail = imageUrl;
        } else if (characterId === 'default') {
            state.characters.unshift({
                ...defaultCharacter,
                thumbnail: imageUrl,
                messages: [...(state.messages || [])]
            });
        } else {
            return false;
        }

        saveToLocalStorage();
        renderCharactersList();
        return true;
    };

    // Sidebar toggle
    elements.toggleSettings?.addEventListener('click', () => ui.toggleSidebar());
    elements.overlay?.addEventListener('click', () => ui.toggleSidebar(false));
    elements.closeSettingsBtn?.addEventListener('click', () => ui.toggleSidebar(false));
    elements.openAdvancedSettingsBtn.addEventListener('click', () =>
        ui.toggleAdvancedSettings(true)
    );
    elements.openAdvancedSettingsPanelBtn.addEventListener('click', () =>
        ui.toggleAdvancedSettings(true)
    );
    elements.advancedSettingsBackdrop.addEventListener('click', () =>
        ui.toggleAdvancedSettings(false)
    );
    elements.closeAdvancedSettingsBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        ui.toggleAdvancedSettings(false);
    });
    elements.advancedSettingsModal.querySelector('summary').addEventListener('click', (e) => {
        e.preventDefault();
    });

    // View navigation
    elements.navChatBtn.addEventListener('click', () => {
        ui.setCurrentView('chat');
        closeSettingsPanel();
    });
    elements.navCharactersBtn?.addEventListener('click', () => {
        ui.setCurrentView('characters');
        closeSettingsPanel();
    });
    elements.navGeneratorBtn.addEventListener('click', () => {
        ui.setCurrentView('generator');
        closeSettingsPanel();
    });
    elements.navGalleryBtn.addEventListener('click', () => {
        ui.setCurrentView('gallery');
        closeSettingsPanel();
    });
    elements.navStatsBtn?.addEventListener('click', () => {
        ui.setCurrentView('stats');
        closeSettingsPanel();
    });

    // Textarea auto-resize
    elements.messageInput.addEventListener('input', () => {
        ui.autoResizeTextarea();
        updateRequestPreviewButtonState();
    });

    // Send message on Enter (not Shift+Enter)
    elements.messageInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });

    // Send button
    elements.sendBtn.addEventListener('click', sendMessage);
    elements.upgradeTextBtn?.addEventListener('click', upgradeCurrentDraft);
    elements.upgradeTextMenuBtn?.addEventListener('click', (event) => {
        event.stopPropagation();
        toggleTextUpgradeMenu();
    });
    elements.textUpgradeMenu?.addEventListener('click', (event) => {
        const option = event.target.closest('[data-upgrade-mode]');
        if (!option) return;
        selectTextUpgradeMode(option.getAttribute('data-upgrade-mode'));
    });
    elements.previewRequestBtn.addEventListener('click', openRequestPreview);
    elements.suggestBtn?.addEventListener('click', () => {
        import('./suggestions.js').then(({ fetchSuggestions, renderSuggestions }) => {
            elements.suggestBtn.disabled = true;
            fetchSuggestions()
                .then(renderSuggestions)
                .catch(() => {})
                .finally(() => {
                    elements.suggestBtn.disabled = false;
                });
        });
    });

    // Chat media lightbox
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
    elements.memoryPanel?.addEventListener('click', handleMemoryPanelClick);

    elements.logoutBtn.addEventListener('click', async () => {
        try {
            await fetch('/api/auth/logout', { method: 'POST' });
        } catch (error) {
            console.error('Logout request failed:', error);
        } finally {
            window.location.href = '/';
        }
    });
    elements.openProfileSettingsBtn?.addEventListener('click', openProfileSettings);
    elements.closeProfileSettingsBtn?.addEventListener('click', closeProfileSettings);
    elements.cancelProfileSettingsBtn?.addEventListener('click', closeProfileSettings);
    elements.saveProfileSettingsBtn?.addEventListener('click', saveProfileSettings);
    elements.addFavoriteModelBtn?.addEventListener('click', addSelectedFavoriteModel);
    elements.favoriteModelsList?.addEventListener('click', (event) => {
        const button = event.target.closest('.favorite-model-remove');
        if (!button) return;

        const model = button.dataset.model || '';
        state.settings.favoriteOpenRouterModels = normalizeFavoriteOpenRouterModels(
            state.settings.favoriteOpenRouterModels
        ).filter((item) => item !== model);
        saveToLocalStorage();
        renderFavoriteModelsList();
        renderOpenRouterQuickModelSelect();
        setProfileStatus('Favorite model removed.');
    });
    elements.profileSettingsModal?.addEventListener('click', (event) => {
        if (event.target === elements.profileSettingsModal) {
            closeProfileSettings();
        }
    });

    let gallerySearchPersistTimer = null;
    const persistGallerySearchSoon = () => {
        window.clearTimeout(gallerySearchPersistTimer);
        gallerySearchPersistTimer = window.setTimeout(() => {
            saveToLocalStorage();
        }, 150);
    };

    elements.gallerySearchInput.addEventListener('input', (e) => {
        state.gallerySearchQuery = e.target.value || '';
        ui.renderGallery();
        persistGallerySearchSoon();
    });

    elements.gallerySortOrder.addEventListener('change', (e) => {
        state.gallerySortOrder = e.target.value || 'newest';
        ui.renderGallery();
        saveToLocalStorage();
    });

    elements.gallerySourceFilter.addEventListener('change', (e) => {
        state.gallerySourceFilter = e.target.value || 'all';
        ui.renderGallery();
        saveToLocalStorage();
    });

    elements.galleryCharacterFilter.addEventListener('change', (e) => {
        state.galleryFilterCharacterId = e.target.value || 'all';
        ui.renderGallery();
        saveToLocalStorage();
    });

    elements.galleryGrid.addEventListener('click', (e) => {
        const btn = e.target.closest('.set-thumbnail-btn');
        if (btn) {
            const imageUrl = btn.getAttribute('data-image-url');
            const targetCharacterId = elements.galleryThumbnailCharacter.value;

            if (!targetCharacterId) {
                showToast('Please choose a character first.', {
                    type: 'warning'
                });
                return;
            }

            const ok = applyCharacterThumbnail(targetCharacterId, imageUrl);
            if (!ok) {
                showToast('Failed to set thumbnail for selected character.', {
                    type: 'error'
                });
                return;
            }

            showToast('Thumbnail updated successfully.', {
                type: 'success'
            });
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
        if (e.key === 'Escape' && !elements.textUpgradeMenu?.classList.contains('hidden')) {
            closeTextUpgradeMenu();
            return;
        }

        if (e.key === 'Escape' && !elements.advancedSettingsModal.classList.contains('hidden')) {
            ui.toggleAdvancedSettings(false);
            return;
        }

        if (e.key === 'Escape' && !elements.profileSettingsModal?.classList.contains('hidden')) {
            closeProfileSettings();
            return;
        }

        if (e.key === 'Escape' && !elements.settingsPanel.classList.contains('-translate-x-full')) {
            ui.toggleSidebar(false);
            return;
        }

        if (e.key === 'Escape' && !elements.galleryLightbox.classList.contains('hidden')) {
            closeLightbox();
            return;
        }

        if (e.key === 'Escape' && !elements.requestPreviewModal.classList.contains('hidden')) {
            ui.closeRequestPreviewModal();
            return;
        }

        if (e.key === 'Escape' && !elements.memoryViewerModal.classList.contains('hidden')) {
            closeMemoryViewerModal();
            return;
        }

        if (e.key === 'Escape' && !elements.editMessageModal.classList.contains('hidden')) {
            ui.closeEditMessageModal();
        }
    });

    document.addEventListener('click', (event) => {
        if (
            !elements.textUpgradeMenu?.classList.contains('hidden') &&
            !event.target.closest('.text-upgrade-control')
        ) {
            closeTextUpgradeMenu();
        }
    });

    // Fetch models buttons
    elements.fetchModelsBtn.addEventListener('click', fetchSwarmModels);
    elements.fetchComfyModelsBtn.addEventListener('click', fetchComfyModels);
    elements.fetchNanoGptModelsBtn.addEventListener('click', fetchNanoGptModels);
    elements.fetchOpenRouterModelsBtn.addEventListener('click', fetchOpenRouterModels);
    elements.refreshUsersBtn.addEventListener('click', () => {
        fetchAdminUsers();
    });
    elements.adminUsersList.addEventListener('click', handleAdminUsersListClick);

    // Setup model search functionality
    setupModelSearch();

    // Persist model selections immediately when changed
    elements.openrouterQuickModel?.addEventListener('change', () => {
        selectOpenRouterModel(elements.openrouterQuickModel.value);
    });

    elements.openrouterModel.addEventListener('change', () => {
        state.settings.openrouterModel = elements.openrouterModel.value;
        renderOpenRouterQuickModelSelect();
        saveToLocalStorage();
    });

    elements.openrouterReasoningEnabled.addEventListener('change', () => {
        state.settings.openrouterReasoningEnabled = elements.openrouterReasoningEnabled.checked;
        elements.openrouterReasoningEffort.disabled = !elements.openrouterReasoningEnabled.checked;
        saveToLocalStorage();
    });

    elements.openrouterReasoningEffort.addEventListener('change', () => {
        state.settings.openrouterReasoningEffort = elements.openrouterReasoningEffort.value;
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

    elements.comfyModel.addEventListener('change', () => {
        state.settings.comfyModel = elements.comfyModel.value;
        saveToLocalStorage();
    });

    elements.nanogptModel.addEventListener('change', () => {
        state.settings.nanogptModel = elements.nanogptModel.value;
        saveToLocalStorage();
    });

    elements.nanogptQuality.addEventListener('change', () => {
        state.settings.nanogptQuality = elements.nanogptQuality.value;
        saveToLocalStorage();
    });

    elements.imageProvider.addEventListener('change', () => {
        state.settings.imageProvider = normalizeImageProvider(elements.imageProvider.value);
        saveToLocalStorage();
    });

    elements.protectedImagePromptLanguage.addEventListener('change', () => {
        state.settings.protectedImagePromptLanguage = elements.protectedImagePromptLanguage.value;
        renderProtectedSystemPromptBlocks(
            elements.protectedSystemPromptBlock,
            state.settings.protectedImagePromptLanguage
        );
        renderProtectedSystemPromptBlocks(
            elements.charProtectedSystemPromptBlock,
            state.settings.protectedImagePromptLanguage
        );
        saveToLocalStorage();
    });

    elements.enableImageGeneration.addEventListener('change', () => {
        state.settings.enableImageGeneration = elements.enableImageGeneration.checked;
        saveToLocalStorage();
    });

    elements.contextMessageCount.addEventListener('change', () => {
        const nextValue = normalizeContextMessageCount(
            elements.contextMessageCount.value,
            state.settings.contextMessageCount
        );
        elements.contextMessageCount.value = nextValue;
        setCurrentChatContextLimit(nextValue);
        saveToLocalStorage();
        renderMessages();
        renderMemoryPanel();
    });

    // Character modal events
    elements.addCharacterBtn.addEventListener('click', () => openCharacterModal());
    elements.charactersViewAddBtn?.addEventListener('click', () => openCharacterModal());
    elements.importCharacterBtn.addEventListener('click', () => {
        elements.characterImportInput.value = '';
        elements.characterImportInput.click();
    });
    elements.charactersViewImportBtn?.addEventListener('click', () => {
        elements.characterImportInput.value = '';
        elements.characterImportInput.click();
    });
    elements.charactersViewGrid?.addEventListener('click', (e) => {
        const editBtn = e.target.closest('.characters-edit-btn');
        if (editBtn) {
            editCharacter(editBtn.getAttribute('data-character-id'));
            return;
        }

        const selectBtn = e.target.closest('.characters-card-select, .characters-chat-btn');
        if (selectBtn) {
            selectCharacter(selectBtn.getAttribute('data-character-id'));
            ui.setCurrentView('chat');
        }
    });
    elements.characterImportInput.addEventListener('change', async (event) => {
        const [file] = Array.from(event.target.files || []);
        event.target.value = '';

        if (!file) {
            return;
        }

        const originalLabel = elements.importCharacterBtn.innerHTML;
        elements.importCharacterBtn.disabled = true;
        elements.importCharacterBtn.innerHTML = 'Importing...';

        try {
            const result = await importCharacterCardFile(file);
            const warningText =
                result.warnings.length > 0 ? `\nWarnings: ${result.warnings.join(' • ')}` : '';
            showToast(`Imported "${result.character.name}" successfully.${warningText}`, {
                type: 'success',
                duration: result.warnings.length > 0 ? 8000 : 5000
            });
        } catch (error) {
            console.error('Character import failed:', error);
            showToast(`Failed to import character card: ${error.message}`, {
                type: 'error'
            });
        } finally {
            elements.importCharacterBtn.disabled = false;
            elements.importCharacterBtn.innerHTML = originalLabel;
        }
    });
    elements.closeModalBtn.addEventListener('click', closeCharacterModal);
    elements.closeEditMessageBtn.addEventListener('click', ui.closeEditMessageModal);
    elements.cancelEditMessageBtn.addEventListener('click', ui.closeEditMessageModal);
    elements.closeRequestPreviewBtn.addEventListener('click', ui.closeRequestPreviewModal);
    elements.closeMemoryViewerBtn.addEventListener('click', closeMemoryViewerModal);
    elements.copyRequestPreviewBtn.addEventListener('click', async () => {
        try {
            await ui.copyCurrentChatRequestPreview();
        } catch (error) {
            console.error('Request preview copy failed:', error);
            showToast(`Failed to copy request: ${error.message}`, {
                type: 'error'
            });
        }
    });
    elements.saveEditMessageBtn.addEventListener('click', () => {
        try {
            saveEditedAssistantMessage(
                ui.getCurrentEditingMessageId(),
                elements.editMessageTextarea.value
            );
            ui.closeEditMessageModal();
        } catch (error) {
            showToast(error.message, {
                type: 'error'
            });
        }
    });
    elements.cancelCharBtn.addEventListener('click', closeCharacterModal);
    elements.deleteCharBtn?.addEventListener('click', deleteEditingCharacter);
    elements.saveCharBtn.addEventListener('click', saveCharacter);
    elements.generateThumbnailBtn.addEventListener('click', generateThumbnail);
    elements.generatePromptBtn.addEventListener('click', generateSystemPromptOnDemand);

    // Close modal on overlay click
    elements.characterModal.addEventListener('click', (e) => {
        if (e.target === elements.characterModal) {
            closeCharacterModal();
        }
    });
    elements.requestPreviewModal.addEventListener('click', (e) => {
        if (e.target === elements.requestPreviewModal) {
            ui.closeRequestPreviewModal();
        }
    });
    elements.memoryViewerModal.addEventListener('click', (e) => {
        if (e.target === elements.memoryViewerModal) {
            closeMemoryViewerModal();
        }
    });
    elements.editMessageModal.addEventListener('click', (e) => {
        if (e.target === elements.editMessageModal) {
            ui.closeEditMessageModal();
        }
    });

    // Save settings
    elements.saveSettingsBtn.addEventListener('click', () => {
        const nextContextMessageCount = normalizeContextMessageCount(
            elements.contextMessageCount.value,
            state.settings.contextMessageCount
        );

        const editableSystemPrompt = stripProtectedSystemPromptBlocks(elements.systemPrompt.value);

        state.settings = {
            textProvider: elements.textProvider.value,
            openrouterKey: elements.openrouterKey.value,
            openrouterModel: elements.openrouterModel.value,
            favoriteOpenRouterModels: normalizeFavoriteOpenRouterModels(
                state.settings.favoriteOpenRouterModels
            ),
            openrouterReasoningEnabled: elements.openrouterReasoningEnabled.checked,
            openrouterReasoningEffort: elements.openrouterReasoningEffort.value,
            swarmUrl: normalizeBaseUrl(elements.swarmUrl.value),
            swarmModel: elements.swarmModel.value,
            comfyUrl: normalizeBaseUrl(elements.comfyUrl.value),
            comfyModel: elements.comfyModel.value,
            nanogptUrl: normalizeBaseUrl(elements.nanogptUrl.value),
            nanogptKey: elements.nanogptKey.value,
            nanogptModel: elements.nanogptModel.value,
            nanogptQuality: elements.nanogptQuality.value,
            imageProvider: normalizeImageProvider(elements.imageProvider.value),
            protectedImagePromptLanguage: elements.protectedImagePromptLanguage.value,
            enableImageGeneration: elements.enableImageGeneration.checked,
            contextMessageCount: nextContextMessageCount,
            imgWidth: parseInt(elements.imgWidth.value, 10),
            imgHeight: parseInt(elements.imgHeight.value, 10),
            steps: parseInt(elements.steps.value, 10),
            cfgScale: parseFloat(elements.cfgScale.value),
            sampler: elements.sampler.value,
            scheduler: elements.scheduler.value,
            systemPrompt: editableSystemPrompt
        };
        setCurrentChatContextLimit(nextContextMessageCount);

        if (state.currentCharacterId !== 'default') {
            const charIndex = state.characters.findIndex((c) => c.id === state.currentCharacterId);
            if (charIndex !== -1) {
                state.characters[charIndex].systemPrompt = editableSystemPrompt;
            }
        }

        saveToLocalStorage();
        showToast('Settings saved.', {
            type: 'success'
        });
        ui.toggleAdvancedSettings(false);
    });

    // Clear chat
    elements.clearChatBtn.addEventListener('click', async () => {
        const confirmed = await requestConfirmation(
            'Clear the current chat history? This removes all saved messages.',
            {
                confirmLabel: 'Clear chat',
                type: 'error'
            }
        );
        if (!confirmed) {
            return;
        }

        state.messages = [];
        state.memoryCompressionDraft = null;
        resetCurrentOpenRouterSessionId();
        const currentCharacter = state.characters.find((c) => c.id === state.currentCharacterId);
        if (currentCharacter) {
            currentCharacter.memorySnapshots = [];
        }
        clearSuggestions();
        renderMessages();
        renderMemoryPanel();
        saveToLocalStorage();
        showToast('Chat cleared.', {
            type: 'success'
        });
    });

    // Range slider updates
    elements.steps.addEventListener('input', (e) => {
        elements.stepsValue.textContent = e.target.value;
    });

    elements.cfgScale.addEventListener('input', (e) => {
        elements.cfgValue.textContent = e.target.value;
    });

    // Writing suggestion chip clicks
    elements.suggestionsContainer?.addEventListener('click', (e) => {
        const chip = e.target.closest('.suggestion-chip');
        if (!chip) return;
        const suggestion = chip.getAttribute('data-suggestion');
        if (!suggestion) return;
        elements.messageInput.value = suggestion;
        elements.messageInput.dispatchEvent(new Event('input'));
        elements.messageInput.focus();
    });
}
