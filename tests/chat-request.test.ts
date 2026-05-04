// @ts-nocheck
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
    buildChatApiMessages,
    buildChatRequestPreview,
    canPreviewChatRequest
} from '../src/client/chat-request.ts';

describe('chat request preview builder', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
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
        expect(preview.body.reasoning).toBeUndefined();
        expect(preview.body.messages.at(-1)).toEqual({
            role: 'user',
            content: 'Hello there'
        });
    });

    it('adds OpenRouter reasoning when enabled', () => {
        const preview = buildChatRequestPreview({
            draftMessage: 'Think this through',
            systemPrompt: 'System prompt',
            openrouterKey: 'sk-test',
            openrouterModel: 'openai/gpt-5',
            openrouterReasoningEnabled: true,
            openrouterReasoningEffort: 'high'
        });

        expect(preview.body.reasoning).toEqual({
            effort: 'high',
            exclude: true
        });
    });

    it('falls back to medium for invalid OpenRouter reasoning effort', () => {
        const preview = buildChatRequestPreview({
            draftMessage: 'Think this through',
            systemPrompt: 'System prompt',
            openrouterKey: 'sk-test',
            openrouterModel: 'openai/gpt-5',
            openrouterReasoningEnabled: true,
            openrouterReasoningEffort: 'turbo'
        });

        expect(preview.body.reasoning).toEqual({
            effort: 'medium',
            exclude: true
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

    it('sends every active raw message regardless of the memory compression limit', () => {
        const historyMessages = Array.from({ length: 25 }, (_, index) => ({
            role: index % 2 === 0 ? 'user' : 'assistant',
            content: `Message ${index + 1}`
        }));

        const messages = buildChatApiMessages({
            systemPrompt: 'System',
            historyMessages,
            contextMessageCount: 20
        });

        expect(messages).toHaveLength(26);
        expect(messages.slice(1)).toEqual(
            historyMessages.map((message) => ({
                role: message.role,
                content: message.content
            }))
        );
    });

    it('excludes archived raw messages after they are compressed into memory', () => {
        const messages = buildChatApiMessages({
            systemPrompt: 'System',
            historyMessages: [
                { role: 'user', content: 'Archived', archivedFromModelContext: true },
                { role: 'assistant', content: 'Still active' }
            ],
            memorySnapshots: [{ finalText: 'Earlier events were summarized.' }]
        });

        expect(messages).toEqual([
            { role: 'system', content: 'System' },
            {
                role: 'system',
                content:
                    'Accepted memory snapshots for this chat:\n\n1. Earlier events were summarized.'
            },
            { role: 'assistant', content: 'Still active' }
        ]);
    });

    it('adds accepted memory snapshots while preserving raw chat message content', () => {
        const rawAssistantContent = `Visible reply

---IMAGE_PROMPT START---
hidden image prompt
---IMAGE_PROMPT END---`;

        const messages = buildChatApiMessages({
            systemPrompt: 'System',
            historyMessages: [
                {
                    role: 'assistant',
                    content: rawAssistantContent
                }
            ],
            memorySnapshots: [{ finalText: 'They agreed to meet at sunset.' }]
        });

        expect(messages[1]).toEqual({
            role: 'system',
            content: 'Accepted memory snapshots for this chat:\n\n1. They agreed to meet at sunset.'
        });
        expect(messages[2]).toEqual({
            role: 'assistant',
            content: rawAssistantContent
        });
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
        const ui = await import('../src/client/ui.ts');
        const preview = buildChatRequestPreview({
            textProvider: 'openrouter',
            draftMessage: 'Inspect me',
            systemPrompt: 'System prompt',
            openrouterKey: 'sk-test',
            openrouterModel: 'openai/gpt-4.1-mini'
        });

        ui.showChatRequestPreview(preview);

        expect(document.getElementById('requestPreviewModal').classList.contains('hidden')).toBe(
            false
        );
        expect(document.getElementById('requestPreviewEndpoint').textContent).toBe(
            'POST https://openrouter.ai/api/v1/chat/completions'
        );
        expect(document.getElementById('requestPreviewBody').textContent).toContain('Inspect me');

        await ui.copyCurrentChatRequestPreview();

        expect(navigator.clipboard.writeText).toHaveBeenCalledWith(preview.displayText);
        expect(document.getElementById('copyRequestPreviewBtn').textContent).toBe('Copied!');
    });
});
