// @ts-nocheck
import { elements } from './dom.js';
import { state } from './state.js';

export const DEFAULT_OPENROUTER_TTS_MODEL = 'x-ai/grok-voice-tts-1.0';
export const DEFAULT_OPENROUTER_TTS_OUTPUT_FORMAT = 'mp3';

function getOpenRouterTtsModel() {
    return (
        String(state.settings.openrouterTtsModel || '').trim() || DEFAULT_OPENROUTER_TTS_MODEL
    );
}

export async function generateOpenRouterSpeechBlob({ text, voiceId }) {
    const apiKey = String(elements.openrouterKey?.value || state.settings.openrouterKey || '').trim();
    if (!apiKey) {
        throw new Error('Enter your OpenRouter API key in settings before using TTS.');
    }

    const response = await fetch('https://openrouter.ai/api/v1/audio/speech', {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': window.location.href,
            'X-Title': 'EroChat'
        },
        body: JSON.stringify({
            model: getOpenRouterTtsModel(),
            input: text,
            voice: voiceId,
            response_format: DEFAULT_OPENROUTER_TTS_OUTPUT_FORMAT
        })
    });

    if (!response.ok) {
        let detail = '';
        try {
            const data = await response.json();
            detail = data?.error?.message || data?.message || '';
        } catch {
            detail = await response.text();
        }

        throw new Error(
            detail
                ? `OpenRouter TTS request failed (${response.status}): ${detail}`
                : `OpenRouter TTS request failed (${response.status}).`
        );
    }

    return response.blob();
}
