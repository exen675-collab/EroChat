import { beforeEach, describe, expect, it } from 'vitest';

import {
    escapeHtml,
    formatMessage,
    getAssistantReadableText,
    getAssistantVisibleText,
    getContextMessageIdSet,
    normalizeBaseUrl,
    normalizeContextMessageCount,
    normalizeImageProvider,
    normalizeSwarmSampler,
    normalizeTtsVoiceId,
    stripImagePromptBlocks
} from '../js/utils.js';

describe('utils helpers', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
    });

    it('normalizes provider URLs', () => {
        expect(normalizeBaseUrl(' http://localhost:8188/ ')).toBe('http://localhost:8188');
        expect(normalizeBaseUrl('')).toBe('');
    });

    it('maps provider aliases and preserves known providers', () => {
        expect(normalizeImageProvider('local')).toBe('swarm');
        expect(normalizeImageProvider('grok')).toBe('premium');
        expect(normalizeImageProvider('comfy')).toBe('comfy');
        expect(normalizeImageProvider('unknown')).toBe('swarm');
    });

    it('normalizes sampler aliases and bounds context message count', () => {
        expect(normalizeSwarmSampler('Euler A')).toBe('euler_ancestral');
        expect(normalizeContextMessageCount('250')).toBe(100);
        expect(normalizeContextMessageCount('0')).toBe(1);
        expect(normalizeContextMessageCount('nope')).toBe(20);
    });

    it('normalizes TTS voices against an allow list', () => {
        expect(normalizeTtsVoiceId('ARA')).toBe('ara');
        expect(normalizeTtsVoiceId('unknown', ['ara', 'eve'])).toBe('ara');
        expect(normalizeTtsVoiceId('eve', ['ara', 'eve'])).toBe('eve');
    });

    it('removes image prompt blocks from assistant text', () => {
        const content = `Scene text

---IMAGE_PROMPT START---
anime prompt
---IMAGE_PROMPT END---`;

        expect(stripImagePromptBlocks(content).trim()).toBe('Scene text');
    });

    it('builds readable assistant text without action markers', () => {
        const content = `*smiles* Hello there.

---IMAGE_PROMPT START---
prompt
---IMAGE_PROMPT END---`;

        expect(getAssistantVisibleText(content)).toContain('*smiles* Hello there.');
        expect(getAssistantReadableText(content)).toBe('smiles Hello there.');
    });

    it('formats action blocks for chat rendering', () => {
        const formatted = formatMessage('*waves*hello', 'user');
        expect(formatted).toContain('chat-action user-action');
        expect(formatted).toContain('<span');
    });

    it('escapes HTML content before rendering', () => {
        expect(escapeHtml('<script>alert("x")</script>')).toBe(
            '&lt;script&gt;alert("x")&lt;/script&gt;'
        );
    });

    it('returns only the latest message ids inside the context window', () => {
        const ids = getContextMessageIdSet([{ id: 'm1' }, { id: 'm2' }, { id: 'm3' }], 2);

        expect(Array.from(ids)).toEqual(['m2', 'm3']);
    });
});
