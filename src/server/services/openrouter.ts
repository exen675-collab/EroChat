export function getOpenRouterMessageText(payload) {
    const content = payload?.choices?.[0]?.message?.content;
    if (typeof content === 'string') {
        return content.trim();
    }
    if (Array.isArray(content)) {
        return content
            .map((part) => {
                if (typeof part === 'string') return part;
                if (typeof part?.text === 'string') return part.text;
                if (typeof part?.content === 'string') return part.content;
                return '';
            })
            .join('')
            .trim();
    }
    return '';
}

export async function readOpenRouterPayload(response) {
    const text = await response.text().catch(() => '');
    if (!text) return {};
    try {
        return JSON.parse(text);
    } catch {
        return { rawText: text.slice(0, 1000) };
    }
}

export function openRouterErrorMessage(status) {
    if (status === 401 || status === 403) {
        return 'OpenRouter rejected the configured API key.';
    }
    if (status === 402) {
        return 'The OpenRouter account has insufficient credits.';
    }
    if (status === 429) {
        return 'OpenRouter rate limit reached. Try again shortly.';
    }
    if (status >= 500) {
        return 'OpenRouter is temporarily unavailable.';
    }
    return 'OpenRouter could not generate a character with the selected model.';
}
