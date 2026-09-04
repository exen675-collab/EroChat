import { afterEach, describe, expect, it, vi } from 'vitest';
import { defaultCharacter, defaultSettings } from '../src/client/config.ts';
import { sendModernChat } from '../src/client/modern/api.ts';
import type { ModernSettings } from '../src/client/modern/types.ts';

function eventStream(chunks: string[]): Response {
    const encoder = new TextEncoder();
    const body = new ReadableStream({
        start(controller) {
            chunks.forEach((chunk) => controller.enqueue(encoder.encode(chunk)));
            controller.close();
        }
    });
    return new Response(body, {
        status: 200,
        headers: { 'Content-Type': 'text/event-stream' }
    });
}

describe('modern chat streaming', () => {
    afterEach(() => {
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
    });

    it('assembles split SSE chunks and publishes cumulative content as it arrives', async () => {
        const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => {
            void _input;
            void _init;
            return eventStream([
                'data: {"choices":[{"delta":{"content":"Hello "}}]}\n',
                '\ndata: {"choices":[{"delta":{"content":"there"}}]}\n\n',
                'data: {"choices":[{"delta":{"content":"!"}}]}\n\ndata: [DONE]\n\n'
            ]);
        });
        vi.stubGlobal('fetch', fetchMock);
        const updates: string[] = [];

        const result = await sendModernChat(
            {
                ...defaultSettings,
                openrouterKey: 'sk-test',
                openrouterModel: 'openai/gpt-5'
            } as ModernSettings,
            defaultCharacter,
            [],
            'Hi',
            (content) => updates.push(content)
        );

        expect(result).toBe('Hello there!');
        expect(updates).toEqual(['Hello ', 'Hello there', 'Hello there!']);
        const request = fetchMock.mock.calls[0][1] as RequestInit;
        expect(JSON.parse(String(request.body))).toMatchObject({ stream: true });
    });

    it('surfaces errors delivered inside an otherwise successful stream', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn(async () => eventStream(['data: {"error":{"message":"Provider failed"}}\n\n']))
        );

        await expect(
            sendModernChat(
                {
                    ...defaultSettings,
                    openrouterKey: 'sk-test',
                    openrouterModel: 'openai/gpt-5'
                } as ModernSettings,
                defaultCharacter,
                [],
                'Hi'
            )
        ).rejects.toThrow('Provider failed');
    });
});
