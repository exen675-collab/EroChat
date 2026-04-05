import { PREMIUM_CHAT_MODEL } from './api-grok.js';
import { getContextMessages, normalizeContextMessageCount } from './utils.js';

export const CHAT_REQUEST_DEFAULTS = Object.freeze({
    temperature: 0.9,
    maxTokens: 2000
});

export function canPreviewChatRequest(draftMessage, isGenerating = false) {
    return !isGenerating && String(draftMessage || '').trim().length > 0;
}

export function buildChatApiMessages({
    systemPrompt,
    historyMessages = [],
    draftMessage = '',
    contextMessageCount = 20
}) {
    const nextMessages = Array.isArray(historyMessages)
        ? historyMessages
              .filter((message) => message && typeof message.content === 'string' && message.role)
              .map((message) => ({
                  role: message.role,
                  content: message.content
              }))
        : [];

    if (String(draftMessage || '').trim()) {
        nextMessages.push({
            role: 'user',
            content: String(draftMessage).trim()
        });
    }

    return [
        { role: 'system', content: String(systemPrompt || '') },
        ...getContextMessages(nextMessages, normalizeContextMessageCount(contextMessageCount))
    ];
}

export function buildChatRequestPreview({
    textProvider = 'premium',
    draftMessage = '',
    systemPrompt = '',
    historyMessages = [],
    contextMessageCount = 20,
    openrouterKey = '',
    openrouterModel = '',
    currentUrl = '',
    temperature = CHAT_REQUEST_DEFAULTS.temperature,
    maxTokens = CHAT_REQUEST_DEFAULTS.maxTokens
}) {
    const provider = textProvider === 'premium' ? 'premium' : 'openrouter';
    const messages = buildChatApiMessages({
        systemPrompt,
        historyMessages,
        draftMessage,
        contextMessageCount
    });

    if (provider === 'premium') {
        const body = {
            model: PREMIUM_CHAT_MODEL,
            messages,
            temperature,
            max_tokens: maxTokens
        };

        return {
            provider,
            method: 'POST',
            url: '/api/premium/chat',
            headers: {
                'Content-Type': 'application/json'
            },
            body,
            displayText: formatChatRequestPreview({
                provider,
                method: 'POST',
                url: '/api/premium/chat',
                headers: {
                    'Content-Type': 'application/json'
                },
                body
            })
        };
    }

    const body = {
        model: openrouterModel,
        messages,
        temperature,
        max_tokens: maxTokens
    };
    const headers = {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${openrouterKey}`,
        'HTTP-Referer': currentUrl,
        'X-Title': 'EroChat'
    };

    return {
        provider,
        method: 'POST',
        url: 'https://openrouter.ai/api/v1/chat/completions',
        headers,
        body,
        displayText: formatChatRequestPreview({
            provider,
            method: 'POST',
            url: 'https://openrouter.ai/api/v1/chat/completions',
            headers,
            body
        })
    };
}

export function formatChatRequestPreview(preview) {
    const method = preview?.method || 'POST';
    const url = preview?.url || '';
    const headers = JSON.stringify(preview?.headers || {}, null, 2);
    const body = JSON.stringify(preview?.body || {}, null, 2);

    return `${method} ${url}

Headers
${headers}

Body
${body}`;
}
