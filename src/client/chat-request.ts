// @ts-nocheck
import { buildSystemPromptWithStaticBlocks } from './static-prompts.js';
import { getActiveRawMessages } from './utils.js';

export const CHAT_REQUEST_DEFAULTS = Object.freeze({
    temperature: 0.9,
    maxTokens: 2000,
    reasoningEffort: 'medium'
});

export const OPENROUTER_REASONING_EFFORTS = Object.freeze([
    'minimal',
    'low',
    'medium',
    'high',
    'xhigh'
]);

export function buildMemoryContextMessage(memorySnapshots = []) {
    const accepted = Array.isArray(memorySnapshots)
        ? memorySnapshots.filter((snapshot) => snapshot?.finalText)
        : [];

    if (accepted.length === 0) {
        return null;
    }

    return {
        role: 'system',
        content: `Accepted memory snapshots for this chat:\n\n${accepted
            .map((snapshot, index) => `${index + 1}. ${snapshot.finalText}`)
            .join('\n\n')}`
    };
}

export function canPreviewChatRequest(draftMessage, isGenerating = false) {
    return !isGenerating && String(draftMessage || '').trim().length > 0;
}

export function buildChatApiMessages({
    systemPrompt,
    protectedImagePromptLanguage = 'pl',
    historyMessages = [],
    draftMessage = '',
    contextMessageCount = 20,
    memorySnapshots = []
}) {
    void contextMessageCount;

    const nextMessages = getActiveRawMessages(historyMessages)
        .filter((message) => message && typeof message.content === 'string' && message.role)
        .map((message) => ({
            role: message.role,
            content: message.content
        }))
        .filter((message) => message.content);

    if (String(draftMessage || '').trim()) {
        nextMessages.push({
            role: 'user',
            content: String(draftMessage).trim()
        });
    }

    const memoryContextMessage = buildMemoryContextMessage(memorySnapshots);

    return [
        {
            role: 'system',
            content: buildSystemPromptWithStaticBlocks(systemPrompt, protectedImagePromptLanguage)
        },
        ...(memoryContextMessage ? [memoryContextMessage] : []),
        ...nextMessages
    ];
}

export function buildChatRequestPreview({
    draftMessage = '',
    systemPrompt = '',
    protectedImagePromptLanguage = 'pl',
    historyMessages = [],
    memorySnapshots = [],
    contextMessageCount = 20,
    openrouterKey = '',
    openrouterModel = '',
    currentUrl = '',
    temperature = CHAT_REQUEST_DEFAULTS.temperature,
    maxTokens = CHAT_REQUEST_DEFAULTS.maxTokens,
    openrouterReasoningEnabled = false,
    openrouterReasoningEffort = CHAT_REQUEST_DEFAULTS.reasoningEffort,
    openrouterSessionId = ''
}) {
    const provider = 'openrouter';
    const messages = buildChatApiMessages({
        systemPrompt,
        protectedImagePromptLanguage,
        historyMessages,
        draftMessage,
        contextMessageCount,
        memorySnapshots
    });

    const body = {
        model: openrouterModel,
        messages,
        temperature,
        max_tokens: maxTokens
    };

    const normalizedSessionId = String(openrouterSessionId || '').trim().slice(0, 256);
    if (normalizedSessionId) {
        body.session_id = normalizedSessionId;
    }

    if (openrouterReasoningEnabled) {
        body.reasoning = {
            effort: OPENROUTER_REASONING_EFFORTS.includes(openrouterReasoningEffort)
                ? openrouterReasoningEffort
                : CHAT_REQUEST_DEFAULTS.reasoningEffort,
            exclude: true
        };
    }

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
        protectedImagePromptLanguage,
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
