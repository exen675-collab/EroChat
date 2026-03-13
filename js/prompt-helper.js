import { elements } from './dom.js';
import { sendGrokChatRequest } from './api-grok.js';
import { sendOpenRouterChatRequest } from './api-openrouter.js';

export const PROMPT_TEMPLATE_GROUPS = [
    {
        label: 'Style',
        chips: ['cinematic realism', 'anime key visual', 'editorial fashion', 'dreamlike fantasy']
    },
    {
        label: 'Lighting',
        chips: ['soft rim lighting', 'golden hour glow', 'neon backlight', 'high-contrast studio light']
    },
    {
        label: 'Camera',
        chips: ['85mm portrait lens', 'wide establishing shot', 'overhead composition', 'close-up detail shot']
    },
    {
        label: 'Mood',
        chips: ['moody atmosphere', 'luxury aesthetic', 'intimate tension', 'kinetic motion']
    }
];

const ACTION_PROMPTS = {
    refine: 'Rewrite this prompt so it is more coherent, vivid, and production-ready while preserving intent. Return only the revised prompt.',
    expand: 'Expand this prompt with stronger visual detail, composition, lighting, and material cues. Return only the revised prompt.',
    variations: 'Rewrite this prompt so it encourages controlled variation while preserving the core subject and style. Return only one revised prompt.',
    preset: 'Refine this prompt after the user applied template fragments. Keep it concise but polished. Return only the revised prompt.'
};

function buildHelperMessages(action, prompt, negativePrompt = '') {
    const instruction = ACTION_PROMPTS[action] || ACTION_PROMPTS.refine;
    return [
        {
            role: 'system',
            content: 'You are a prompt editor for image and video generation. Return only the improved prompt text, with no explanation.'
        },
        {
            role: 'user',
            content: `${instruction}\n\nPrompt:\n${prompt}\n\nNegative prompt:\n${negativePrompt || '(none)'}`
        }
    ];
}

export function appendTemplateSnippet(prompt, snippet) {
    const base = String(prompt || '').trim();
    if (!base) return snippet;
    return `${base}, ${snippet}`;
}

export async function runPromptHelperAction({ action, prompt, negativePrompt = '', provider = 'off' }) {
    const trimmedPrompt = String(prompt || '').trim();
    if (!trimmedPrompt) {
        throw new Error('Enter a prompt before using the prompt helper.');
    }

    if (provider === 'off') {
        throw new Error('Select a prompt-helper provider first.');
    }

    const messages = buildHelperMessages(action, trimmedPrompt, negativePrompt);
    if (provider === 'premium') {
        return sendGrokChatRequest(messages, {
            temperature: 0.6,
            maxTokens: 900
        });
    }

    if (!elements.openrouterKey.value || !elements.openrouterModel.value) {
        throw new Error('OpenRouter is not configured. Add your key and select a model in settings.');
    }

    return sendOpenRouterChatRequest(messages);
}
