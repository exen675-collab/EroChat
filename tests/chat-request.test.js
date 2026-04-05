import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
    buildChatApiMessages,
    buildChatRequestPreview,
    canPreviewChatRequest
} from '../js/chat-request.js';

describe('chat request preview builder', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
    });

    it('builds premium chat requests with the current draft and bounded context', () => {
        const preview = buildChatRequestPreview({
            textProvider: 'premium',
            draftMessage: 'Newest draft',
            systemPrompt: 'Stay in character.',
            historyMessages: [
                { role: 'user', content: 'Old user' },
                { role: 'assistant', content: 'Old assistant' },
                { role: 'assistant', content: 'Keep this assistant reply' }
            ],
            contextMessageCount: 2
        });

        expect(preview.provider).toBe('premium');
        expect(preview.url).toBe('/api/premium/chat');
        expect(preview.body.model).toBe('grok-4-1-fast-reasoning');
        expect(preview.body.messages).toEqual([
            { role: 'system', content: 'Stay in character.' },
            { role: 'assistant', content: 'Keep this assistant reply' },
            { role: 'user', content: 'Newest draft' }
        ]);
    });

    it('builds openrouter chat requests with the expected browser headers', () => {
        const preview = buildChatRequestPreview({
            textProvider: 'openrouter',
            draftMessage: 'Hello there',
            systemPrompt: 'System prompt',
            historyMessages: [],
            contextMessageCount: 20,
            openrouterKey: 'sk-test',
            openrouterModel: 'openai/gpt-4.1-mini',
            currentUrl: 'https://example.com/chat'
        });

        expect(preview.provider).toBe('openrouter');
        expect(preview.url).toBe('https://openrouter.ai/api/v1/chat/completions');
        expect(preview.headers).toEqual({
            'Content-Type': 'application/json',
            Authorization: 'Bearer sk-test',
            'HTTP-Referer': 'https://example.com/chat',
            'X-Title': 'EroChat'
        });
        expect(preview.body).toMatchObject({
            model: 'openai/gpt-4.1-mini',
            temperature: 0.9,
            max_tokens: 2000
        });
        expect(preview.body.messages.at(-1)).toEqual({
            role: 'user',
            content: 'Hello there'
        });
    });

    it('marks preview availability based on draft content and generation state', () => {
        expect(canPreviewChatRequest('', false)).toBe(false);
        expect(canPreviewChatRequest('Hello', true)).toBe(false);
        expect(canPreviewChatRequest('Hello', false)).toBe(true);
    });

    it('builds API messages from history plus the pending draft', () => {
        expect(
            buildChatApiMessages({
                systemPrompt: 'System',
                historyMessages: [
                    { role: 'user', content: 'One' },
                    { role: 'assistant', content: 'Two' }
                ],
                draftMessage: 'Three',
                contextMessageCount: 3
            })
        ).toEqual([
            { role: 'system', content: 'System' },
            { role: 'user', content: 'One' },
            { role: 'assistant', content: 'Two' },
            { role: 'user', content: 'Three' }
        ]);
    });
});

describe('request preview modal helpers', () => {
    beforeEach(() => {
        vi.resetModules();
        document.body.innerHTML = `
            <div id="settingsPanel" class="-translate-x-full"></div>
            <div id="requestPreviewModal" class="hidden"></div>
            <button id="copyRequestPreviewBtn" type="button">Copy request</button>
            <button id="closeRequestPreviewBtn" type="button"></button>
            <div id="requestPreviewProvider"></div>
            <code id="requestPreviewEndpoint"></code>
            <pre id="requestPreviewHeaders"></pre>
            <pre id="requestPreviewBody"></pre>
        `;
        Object.defineProperty(globalThis, 'navigator', {
            value: {
                clipboard: {
                    writeText: vi.fn().mockResolvedValue()
                }
            },
            configurable: true
        });
    });

    it('renders and copies the current request preview', async () => {
        const ui = await import('../js/ui.js');
        const preview = buildChatRequestPreview({
            textProvider: 'premium',
            draftMessage: 'Inspect me',
            systemPrompt: 'System prompt'
        });

        ui.showChatRequestPreview(preview);

        expect(document.getElementById('requestPreviewModal').classList.contains('hidden')).toBe(
            false
        );
        expect(document.getElementById('requestPreviewEndpoint').textContent).toBe(
            'POST /api/premium/chat'
        );
        expect(document.getElementById('requestPreviewBody').textContent).toContain('Inspect me');

        await ui.copyCurrentChatRequestPreview();

        expect(navigator.clipboard.writeText).toHaveBeenCalledWith(preview.displayText);
        expect(document.getElementById('copyRequestPreviewBtn').textContent).toBe('Copied!');
    });
});
