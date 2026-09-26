import { afterEach, expect, it, vi } from 'vitest';
import { defaultCharacter, defaultSettings } from '../src/client/config.ts';
import { createChatPreview, sendModernChat, sendUtilityRequest } from '../src/client/modern/api.ts';
import type { ModernSettings } from '../src/client/modern/types.ts';

const settings = {
    ...defaultSettings,
    textProvider: 'grok-cli',
    grokModel: 'grok-build',
    openrouterKey: ''
} as ModernSettings;
afterEach(() => vi.unstubAllGlobals());

it('routes chat and utilities through Grok without OpenRouter credentials', async () => {
    const fetchMock = vi.fn(
        async () =>
            new Response(JSON.stringify({ choices: [{ message: { content: 'Hello!' } }] }), {
                headers: { 'Content-Type': 'application/json' }
            })
    );
    vi.stubGlobal('fetch', fetchMock);
    const update = vi.fn();
    expect(await sendModernChat(settings, defaultCharacter, [], 'Hi', update)).toBe('Hello!');
    expect(update).toHaveBeenCalledWith('Hello!');
    expect(
        await sendUtilityRequest(settings, [{ role: 'user', content: 'Summarize' }], {
            model: 'openrouter/other'
        })
    ).toBe('Hello!');
    for (const [url, init] of fetchMock.mock.calls as unknown as [string, RequestInit][]) {
        expect(url).toBe('/api/experimental/grok/chat');
        expect(init.headers).not.toHaveProperty('Authorization');
        expect(JSON.parse(String(init.body)).model).toBe('grok-build');
    }
});

it('previews the actual Grok request with history and no ignored OpenRouter options', () => {
    const preview = createChatPreview(
        settings,
        defaultCharacter,
        [{ id: '1', role: 'assistant', content: 'Earlier reply' }],
        'Next'
    );
    expect(preview.provider).toBe('grok-cli');
    expect(preview.body.messages).toEqual(
        expect.arrayContaining([
            { role: 'assistant', content: 'Earlier reply' },
            { role: 'user', content: 'Next' }
        ])
    );
    expect(preview.body).not.toHaveProperty('temperature');
    expect(preview.displayText).not.toContain('Authorization');
    expect(preview.displayText).toContain('/api/experimental/grok/chat');
});

it('surfaces authentication failures', async () => {
    vi.stubGlobal(
        'fetch',
        vi.fn(async () => new Response(JSON.stringify({ error: 'Unauthorized.' }), { status: 401 }))
    );
    await expect(sendModernChat(settings, defaultCharacter, [], 'Hi')).rejects.toThrow(
        'Unauthorized.'
    );
});
