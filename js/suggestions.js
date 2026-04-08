import { state } from './state.js';
import { elements } from './dom.js';
import { getCurrentCharacter } from './characters.js';
import { getContextMessages, normalizeContextMessageCount, escapeHtml } from './utils.js';
import { sendOpenRouterChatRequest } from './api-openrouter.js';

const SUGGESTIONS_SYSTEM_PROMPT =
    'You are a conversation assistant. ' +
    'Based on the roleplay conversation provided, suggest exactly 3 short messages the user could write next. ' +
    'Return ONLY a valid JSON array of 3 strings, with no markdown, no code fences, and no explanation. ' +
    'Each suggestion must be concise (under 25 words).';

export async function fetchSuggestions() {
    if (!elements.openrouterKey?.value || !elements.openrouterModel?.value) return [];
    if (!state.messages.length) return [];

    const contextMessages = getContextMessages(
        state.messages
            .filter((m) => m?.role && typeof m.content === 'string')
            .map((m) => ({ role: m.role, content: m.content })),
        Math.min(normalizeContextMessageCount(state.settings.contextMessageCount), 10)
    );

    const character = getCurrentCharacter();
    const characterContext = character?.systemPrompt
        ? `Character context:\n${character.systemPrompt}\n\n`
        : '';

    const messages = [
        { role: 'system', content: SUGGESTIONS_SYSTEM_PROMPT },
        ...contextMessages,
        {
            role: 'user',
            content:
                characterContext +
                'Based on the conversation above, suggest 3 short messages I could write next. Return ONLY a JSON array of 3 strings.'
        }
    ];

    try {
        const raw = await sendOpenRouterChatRequest(messages);
        const trimmed = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) {
            return parsed
                .filter((s) => typeof s === 'string' && s.trim())
                .slice(0, 3);
        }
    } catch {
        // Silently fail — suggestions are non-critical
    }
    return [];
}

export function renderSuggestions(suggestions) {
    if (!elements.suggestionsContainer) return;
    if (!suggestions.length) {
        clearSuggestions();
        return;
    }

    elements.suggestionsContainer.innerHTML = suggestions
        .map(
            (s) =>
                `<button type="button" class="suggestion-chip" data-suggestion="${escapeHtml(s)}">${escapeHtml(s)}</button>`
        )
        .join('');
    elements.suggestionsOuter?.classList.remove('hidden');
}

export function clearSuggestions() {
    if (!elements.suggestionsContainer) return;
    elements.suggestionsContainer.innerHTML = '';
    elements.suggestionsOuter?.classList.add('hidden');
}
