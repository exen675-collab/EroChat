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

// Format message text:
// - convert *action* segments into highlighted spans
// - keep normal dialog/plain text unchanged
// - convert newlines to <br>
export function formatMessage(text, role = 'ai') {
    const safeText = String(text ?? '');
    const actionClass = role === 'user' ? 'chat-action user-action' : 'chat-action ai-action';
    const withActionLineBreaks = safeText.replace(/\*([^*]+)\*/g, (match, actionText, offset, source) => {
        const afterAction = source.slice(offset + match.length);
        const alreadyEndsLine = /^\s*\n/.test(afterAction);
        return `<span class="${actionClass}">${actionText}</span>${alreadyEndsLine ? '' : '\n'}`;
    });

    return withActionLineBreaks
        .replace(/\n/g, '<br>');
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


// Normalize base URL by trimming spaces and trailing slash
export function normalizeBaseUrl(url) {
    return (url || '').trim().replace(/\/$/, '');
}
