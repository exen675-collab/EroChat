import { elements } from './dom.js';
import { state } from './state.js';
import { defaultCharacter } from './config.js';
import { escapeHtml } from './utils.js';
import { saveToLocalStorage } from './storage.js';

const VIEW_DESCRIPTIONS = {
    chat: 'Chat workspace',
    generator: 'Standalone generator',
    gallery: 'Media gallery'
};

function normalizeView(view) {
    return ['chat', 'generator', 'gallery'].includes(view) ? view : 'chat';
}

function getViewHash(view) {
    return `#${normalizeView(view)}`;
}

function getChatGalleryItems() {
    return state.galleryImages.map((item) => ({
        ...item,
        mediaSource: 'chat',
        isGeneratorAsset: false
    }));
}

function getGeneratorGalleryItems() {
    return state.generatorAssets.map((asset) => ({
        id: `generator_${asset.id}`,
        imageUrl: asset.mediaType === 'image' ? asset.url : null,
        videoUrl: asset.mediaType === 'video' ? asset.url : null,
        characterId: null,
        characterName: 'Generator',
        characterAvatar: '🎞️',
        source: 'generator',
        mediaSource: 'generator',
        prompt: asset.prompt || '',
        mode: asset.mode || 'generator',
        assetId: asset.id,
        messageId: null,
        createdAt: asset.createdAt,
        thumbnailUrl: asset.thumbnailUrl || null,
        isGeneratorAsset: true
    }));
}

function sortByCreatedAtDesc(items) {
    return [...items].sort((a, b) => {
        const aTime = Date.parse(a.createdAt || '') || 0;
        const bTime = Date.parse(b.createdAt || '') || 0;
        return bTime - aTime;
    });
}

function getMergedGalleryItems() {
    const merged = [];
    const seen = new Set();

    [...getChatGalleryItems(), ...getGeneratorGalleryItems()].forEach((item) => {
        const key = `${item.mediaSource}:${item.imageUrl || ''}:${item.videoUrl || ''}`;
        if (seen.has(key)) return;
        seen.add(key);
        merged.push(item);
    });

    return sortByCreatedAtDesc(merged);
}

function getFilteredGalleryItems() {
    const sourceFilter = state.gallerySourceFilter || 'all';
    const characterFilter = state.galleryFilterCharacterId || 'all';

    return getMergedGalleryItems().filter((item) => {
        if (sourceFilter !== 'all' && item.mediaSource !== sourceFilter) {
            return false;
        }

        if (characterFilter === 'all') {
            return true;
        }

        if (item.mediaSource === 'generator') {
            return sourceFilter === 'all';
        }

        return item.characterId === characterFilter;
    });
}

function setActiveNavButton(activeView) {
    const buttons = [
        [elements.navChatBtn, 'chat'],
        [elements.navGeneratorBtn, 'generator'],
        [elements.navGalleryBtn, 'gallery']
    ];

    buttons.forEach(([button, view]) => {
        if (!button) return;
        button.classList.toggle('is-active', view === activeView);
    });
}

function isWorkspaceOpen() {
    return !elements.settingsPanel.classList.contains('-translate-x-full');
}

function isAdvancedSettingsOpen() {
    return elements.advancedSettingsModal && !elements.advancedSettingsModal.classList.contains('hidden');
}

function syncBodyOverlayState() {
    document.body.classList.toggle('settings-open', isWorkspaceOpen() || isAdvancedSettingsOpen());
}

export function ensureAdvancedSettingsModalMounted() {
    if (!elements.advancedSettingsModal || !document.body.contains(elements.advancedSettingsModal)) {
        return;
    }

    if (elements.advancedSettingsModal.parentElement !== document.body) {
        document.body.appendChild(elements.advancedSettingsModal);
    }
}

// Toggle settings popout visibility
export function toggleSidebar(forceOpen = null) {
    const shouldOpen = forceOpen !== null
        ? forceOpen
        : elements.settingsPanel.classList.contains('-translate-x-full');

    elements.settingsPanel.classList.toggle('-translate-x-full', !shouldOpen);
    elements.overlay.classList.toggle('hidden', !shouldOpen);
    syncBodyOverlayState();
}

export function toggleAdvancedSettings(forceOpen = null) {
    if (!elements.advancedSettingsModal || !elements.advancedSettingsBackdrop) {
        return;
    }

    ensureAdvancedSettingsModalMounted();

    const shouldOpen = forceOpen !== null
        ? forceOpen
        : elements.advancedSettingsModal.classList.contains('hidden');

    if (shouldOpen) {
        toggleSidebar(false);
        elements.advancedSettingsModal.open = true;
    }

    elements.advancedSettingsModal.classList.toggle('hidden', !shouldOpen);
    elements.advancedSettingsBackdrop.classList.toggle('hidden', !shouldOpen);
    syncBodyOverlayState();
}

// Auto-resize textarea as user types
export function autoResizeTextarea() {
    elements.messageInput.style.height = 'auto';
    elements.messageInput.style.height = `${Math.min(elements.messageInput.scrollHeight, 150)}px`;
}

// Scroll chat container to bottom
export function scrollToBottom() {
    elements.chatContainer.scrollTop = elements.chatContainer.scrollHeight;
}

export function setCurrentView(view, options = {}) {
    const nextView = normalizeView(view);
    const shouldSyncHash = options.syncHash !== false;
    const shouldPersist = options.persist !== false;

    state.currentView = nextView;

    elements.chatView.classList.toggle('hidden', nextView !== 'chat');
    elements.generatorView.classList.toggle('hidden', nextView !== 'generator');
    elements.galleryView.classList.toggle('hidden', nextView !== 'gallery');
    elements.chatSettingsPane.classList.toggle('hidden', nextView !== 'chat');
    elements.generatorSettingsPane.classList.toggle('hidden', nextView !== 'generator');
    elements.currentCharacterDisplay.classList.toggle('hidden', nextView !== 'chat');
    elements.currentViewDescription.textContent = VIEW_DESCRIPTIONS[nextView] || VIEW_DESCRIPTIONS.chat;

    setActiveNavButton(nextView);

    if (nextView === 'gallery') {
        renderGalleryCharacterFilter();
        renderGalleryThumbnailCharacterSelect();
        elements.galleryCharacterFilter.value = state.galleryFilterCharacterId || 'all';
        elements.gallerySourceFilter.value = state.gallerySourceFilter || 'all';
        renderGallery();
    }

    if (shouldPersist) {
        saveToLocalStorage();
    }

    if (shouldSyncHash && window.location.hash !== getViewHash(nextView)) {
        window.location.hash = getViewHash(nextView);
    }
}

// Open gallery view (defaults to showing all media)
export function openGallery() {
    setCurrentView('gallery');
}

// Close gallery view (back to chat)
export function closeGallery() {
    setCurrentView('chat');
}

// Render gallery character filter options
export function renderGalleryCharacterFilter() {
    const optionMap = new Map();
    optionMap.set('all', 'All characters');
    optionMap.set(defaultCharacter.id, defaultCharacter.name);

    state.characters.forEach((char) => {
        optionMap.set(char.id, char.name);
    });

    getChatGalleryItems().forEach((item) => {
        if (item.characterId && !optionMap.has(item.characterId)) {
            optionMap.set(item.characterId, item.characterName || 'Unknown Character');
        }
    });

    elements.galleryCharacterFilter.innerHTML = '';
    optionMap.forEach((label, value) => {
        const option = document.createElement('option');
        option.value = value;
        option.textContent = label;
        elements.galleryCharacterFilter.appendChild(option);
    });
}

// Render target character selector for thumbnail assignment
export function renderGalleryThumbnailCharacterSelect() {
    const allCharacters = [];
    const storedDefault = state.characters.find((c) => c.id === 'default') || { ...defaultCharacter };
    allCharacters.push(storedDefault);

    state.characters
        .filter((c) => c.id !== 'default')
        .forEach((c) => allCharacters.push(c));

    const currentSelection = elements.galleryThumbnailCharacter.value || state.currentCharacterId || 'default';
    elements.galleryThumbnailCharacter.innerHTML = '';

    allCharacters.forEach((char) => {
        const option = document.createElement('option');
        option.value = char.id;
        option.textContent = `Set thumbnail for: ${char.name}`;
        elements.galleryThumbnailCharacter.appendChild(option);
    });

    if (allCharacters.some((c) => c.id === currentSelection)) {
        elements.galleryThumbnailCharacter.value = currentSelection;
    } else if (allCharacters.length > 0) {
        elements.galleryThumbnailCharacter.value = allCharacters[0].id;
    }
}

// Render gallery grid
export function renderGallery() {
    const filteredItems = getFilteredGalleryItems();

    if (filteredItems.length === 0) {
        elements.galleryGrid.innerHTML = `
            <div class="col-span-full text-center py-12 text-gray-400">
                <p class="text-lg mb-1">No media found</p>
                <p class="text-sm text-gray-500">Generate images in chat or use the standalone generator to populate this gallery.</p>
            </div>
        `;
        return;
    }

    elements.galleryGrid.innerHTML = '';
    filteredItems.forEach((item) => {
        const mediaMarkup = item.videoUrl
            ? `<video src="${item.videoUrl}" class="gallery-video w-full h-full object-cover cursor-zoom-in" preload="metadata" autoplay loop muted playsinline data-full-video="${item.videoUrl}"></video>`
            : `<img src="${item.imageUrl}" alt="Generated image" class="gallery-image w-full h-full object-cover cursor-zoom-in" data-full-image="${item.imageUrl}">`;

        const thumbnailButtonMarkup = item.imageUrl
            ? `
                <div class="mt-3">
                    <button class="set-thumbnail-btn w-full py-2 btn-secondary rounded-lg text-xs font-medium" data-image-url="${item.imageUrl}">
                        Use as character thumbnail
                    </button>
                </div>
            `
            : '';

        const title = item.isGeneratorAsset
            ? 'Generator'
            : escapeHtml(item.characterName || 'Unknown Character');

        const icon = item.isGeneratorAsset
            ? '🎞️'
            : escapeHtml(item.characterAvatar || '🤖');

        const detail = item.isGeneratorAsset
            ? escapeHtml(item.prompt || 'Generated asset')
            : escapeHtml(item.source || 'chat');

        const card = document.createElement('div');
        card.className = 'gallery-card glass rounded-xl border border-purple-900/30';
        card.innerHTML = `
            <div class="gallery-image-wrap bg-black/30 overflow-hidden">
                ${mediaMarkup}
            </div>
            <div class="p-3 text-sm">
                <div class="flex items-center justify-between gap-3">
                    <div class="flex items-center gap-2 text-gray-300 min-w-0">
                        <span>${icon}</span>
                        <span class="truncate">${title}</span>
                    </div>
                    <span class="gallery-source-tag">${item.mediaSource === 'generator' ? 'Generator' : 'Chat'}</span>
                </div>
                <p class="gallery-meta-copy">${detail}</p>
                ${thumbnailButtonMarkup}
            </div>
        `;
        elements.galleryGrid.appendChild(card);
    });
}
