import { describe, expect, it } from 'vitest';
import {
    getActiveRawMessages,
    getAssistantReadableText,
    getAssistantVisibleText,
    normalizeBaseUrl,
    normalizeImageScheduler,
    normalizeSwarmSampler,
    stripImagePromptBlocks
} from '../src/client/utils.ts';

describe('client utility helpers', () => {
    it('normalizes provider URLs', () => {
        expect(normalizeBaseUrl(' http://localhost:8188/ ')).toBe('http://localhost:8188');
        expect(normalizeBaseUrl('')).toBe('');
    });

    it('normalizes image sampler and scheduler names', () => {
        expect(normalizeSwarmSampler('Euler A')).toBe('euler_ancestral');
        expect(normalizeImageScheduler('Karras')).toBe('karras');
        expect(normalizeImageScheduler('sgm uniform')).toBe('sgm_uniform');
        expect(normalizeImageScheduler('none')).toBe('');
        expect(normalizeImageScheduler('unknown')).toBe('karras');
    });

    it('removes supported image prompt blocks from assistant text', () => {
        const delimited = `Scene text

---IMAGE_PROMPT START---
anime prompt
---IMAGE_PROMPT END---`;
        const xml = 'Scene text\n\n<image_prompt>anime prompt</image_prompt>';

        expect(stripImagePromptBlocks(delimited).trim()).toBe('Scene text');
        expect(stripImagePromptBlocks(xml).trim()).toBe('Scene text');
    });

    it('builds readable assistant text without action markers', () => {
        const content = `*smiles* Hello there.

---IMAGE_PROMPT START---
prompt
---IMAGE_PROMPT END---`;

        expect(getAssistantVisibleText(content)).toContain('*smiles* Hello there.');
        expect(getAssistantReadableText(content)).toBe('smiles Hello there.');
    });

    it('excludes archived messages from model context', () => {
        const messages = [{ id: 'm1', archivedFromModelContext: true }, { id: 'm2' }, { id: 'm3' }];

        expect(getActiveRawMessages(messages).map((message) => message.id)).toEqual(['m2', 'm3']);
    });
});
