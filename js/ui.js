import { elements } from './dom.js';

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
