import { elements } from './dom.js';

// Generate unique ID
export function generateId() {
    return 'msg_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

// Escape HTML to prevent XSS
export function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Format message text (convert newlines to <br>)
export function formatMessage(text) {
    return text.replace(/\n/g, '<br>');
}

// Update connection status indicator
export function updateConnectionStatus(connected) {
    const dot = elements.connectionStatus.querySelector('span:first-child');
    const text = elements.connectionStatus.querySelector('span:last-child');
    
    if (connected) {
        dot.className = 'w-2 h-2 rounded-full bg-green-500';
        text.textContent = 'Connected';
        text.className = 'text-green-400';
    } else {
        dot.className = 'w-2 h-2 rounded-full bg-gray-500';
        text.textContent = 'Disconnected';
        text.className = 'text-gray-400';
    }
}
