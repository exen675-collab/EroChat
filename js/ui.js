import { elements } from './dom.js';
import { state } from './state.js';
import { defaultCharacter } from './config.js';
import { escapeHtml } from './utils.js';

// Toggle sidebar visibility (mobile)
export function toggleSidebar(forceOpen = null) {
    if (window.innerWidth >= 1024) return;

    const shouldOpen = forceOpen !== null
        ? forceOpen
        : elements.settingsPanel.classList.contains('-translate-x-full');

    elements.settingsPanel.classList.toggle('-translate-x-full', !shouldOpen);
    elements.overlay.classList.toggle('hidden', !shouldOpen);
}

// Auto-resize textarea as user types
export function autoResizeTextarea() {
    elements.messageInput.style.height = 'auto';
    elements.messageInput.style.height = Math.min(elements.messageInput.scrollHeight, 150) + 'px';
}

// Scroll chat container to bottom
export function scrollToBottom() {
    elements.chatContainer.scrollTop = elements.chatContainer.scrollHeight;
}

// Open gallery view (defaults to showing all media)
export function openGallery() {
    state.galleryFilterCharacterId = 'all';
    renderGalleryCharacterFilter();
    renderGalleryThumbnailCharacterSelect();
    elements.galleryCharacterFilter.value = 'all';
    renderGallery();
    elements.chatView.classList.add('hidden');
    elements.galleryView.classList.remove('hidden');
}

// Close gallery view (back to chat)
export function closeGallery() {
    elements.galleryView.classList.add('hidden');
    elements.chatView.classList.remove('hidden');
}

// Render gallery character filter options
export function renderGalleryCharacterFilter() {
    const optionMap = new Map();
    optionMap.set('all', 'All characters');

    optionMap.set(defaultCharacter.id, defaultCharacter.name);
    state.characters.forEach(char => {
        optionMap.set(char.id, char.name);
    });

    state.galleryImages.forEach(item => {
        if (!optionMap.has(item.characterId)) {
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

    const storedDefault = state.characters.find(c => c.id === 'default') || { ...defaultCharacter };
    allCharacters.push(storedDefault);

    state.characters
        .filter(c => c.id !== 'default')
        .forEach(c => allCharacters.push(c));

    const currentSelection = elements.galleryThumbnailCharacter.value || state.currentCharacterId || 'default';
    elements.galleryThumbnailCharacter.innerHTML = '';

    allCharacters.forEach(char => {
        const option = document.createElement('option');
        option.value = char.id;
        option.textContent = `Set thumbnail for: ${char.name}`;
        elements.galleryThumbnailCharacter.appendChild(option);
    });

    if (allCharacters.some(c => c.id === currentSelection)) {
        elements.galleryThumbnailCharacter.value = currentSelection;
    } else if (allCharacters.length > 0) {
        elements.galleryThumbnailCharacter.value = allCharacters[0].id;
    }
}

// Render gallery grid
export function renderGallery() {
    const filterCharacterId = state.galleryFilterCharacterId || 'all';
    const filteredImages = filterCharacterId === 'all'
        ? state.galleryImages
        : state.galleryImages.filter(item => item.characterId === filterCharacterId);

    if (filteredImages.length === 0) {
        elements.galleryGrid.innerHTML = `
            <div class="col-span-full text-center py-12 text-gray-400">
                <p class="text-lg mb-1">No media found</p>
                <p class="text-sm text-gray-500">Generate images or videos in chat to populate your gallery.</p>
            </div>
        `;
        return;
    }

    elements.galleryGrid.innerHTML = '';
    filteredImages.forEach(item => {
        const mediaMarkup = item.videoUrl
            ? `<video src="${item.videoUrl}" class="gallery-video w-full h-full object-cover cursor-zoom-in" preload="metadata" muted playsinline data-full-video="${item.videoUrl}"></video>`
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

        const card = document.createElement('div');
        card.className = 'gallery-card glass rounded-xl border border-purple-900/30';
        card.innerHTML = `
            <div class="gallery-image-wrap bg-black/30 overflow-hidden">
                ${mediaMarkup}
            </div>
            <div class="p-3 text-sm">
                <div class="flex items-center gap-2 text-gray-300">
                    <span>${escapeHtml(item.characterAvatar || '🤖')}</span>
                    <span class="truncate">${escapeHtml(item.characterName || 'Unknown Character')}</span>
                </div>
                ${thumbnailButtonMarkup}
            </div>
        `;
        elements.galleryGrid.appendChild(card);
    });
}
