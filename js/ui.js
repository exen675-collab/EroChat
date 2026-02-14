import { elements } from './dom.js';

// Toggle sidebar visibility (mobile)
export function toggleSidebar() {
    elements.settingsPanel.classList.toggle('-translate-x-full');
    elements.overlay.classList.toggle('hidden');
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
