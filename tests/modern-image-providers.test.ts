import { afterEach, describe, expect, it, vi } from 'vitest';
import { defaultSettings } from '../src/client/config.ts';
import { fetchProviderModels, generateImages } from '../src/client/modern/api.ts';
import type { ModernSettings } from '../src/client/modern/types.ts';

function openRouterSettings(patch: Partial<ModernSettings> = {}): ModernSettings {
    return {
        ...defaultSettings,
        imageProvider: 'openrouter',
        openrouterKey: 'sk-or-test',
        openrouterImageModel: 'openai/gpt-image-1',
        ...patch
    } as ModernSettings;
}

describe('OpenRouter image provider', () => {
    afterEach(() => {
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
    });

    it('loads only the dedicated OpenRouter image model catalog', async () => {
        const fetchMock = vi.fn<typeof fetch>();
        fetchMock.mockResolvedValue(
            new Response(
                JSON.stringify({
                    data: [{ id: 'openai/gpt-image-1' }, { id: 'bytedance-seed/seedream-4.5' }]
                }),
                { status: 200 }
            )
        );
        vi.stubGlobal('fetch', fetchMock);

        await expect(fetchProviderModels('openrouter', openRouterSettings())).resolves.toEqual([
            'bytedance-seed/seedream-4.5',
            'openai/gpt-image-1'
        ]);
        expect(fetchMock).toHaveBeenCalledWith(
            'https://openrouter.ai/api/v1/images/models',
            expect.objectContaining({
                headers: { Authorization: 'Bearer sk-or-test' }
            })
        );
    });

    it('generates an image with the selected model and converts Base64 output', async () => {
        const fetchMock = vi.fn<typeof fetch>();
        fetchMock.mockResolvedValue(
            new Response(
                JSON.stringify({ data: [{ b64_json: 'aW1hZ2U=', media_type: 'image/webp' }] }),
                { status: 200 }
            )
        );
        vi.stubGlobal('fetch', fetchMock);

        await expect(
            generateImages(openRouterSettings(), { prompt: 'A moonlit portrait', batchCount: 1 })
        ).resolves.toEqual([{ url: 'data:image/webp;base64,aW1hZ2U=' }]);

        const [, request] = fetchMock.mock.calls[0];
        expect(JSON.parse(String(request?.body))).toEqual({
            model: 'openai/gpt-image-1',
            prompt: 'A moonlit portrait',
            n: 1
        });
    });
});

describe('image generation results', () => {
    afterEach(() => {
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
    });

    it('treats a Swarm response with no images as a failure', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn(
                async (input: RequestInfo | URL) =>
                    new Response(
                        JSON.stringify(
                            String(input).endsWith('/API/GetNewSession')
                                ? { session_id: 'session-empty' }
                                : { images: [] }
                        ),
                        { status: 200 }
                    )
            )
        );

        await expect(
            generateImages(
                openRouterSettings({
                    imageProvider: 'swarm',
                    swarmUrl: 'http://empty-swarm.test',
                    swarmModel: 'model-a'
                }),
                { prompt: 'A lighthouse', batchCount: 1 }
            )
        ).rejects.toThrow('The image provider returned no images.');
    });

    it('starts a new Swarm session when the server URL changes', async () => {
        const fetchMock = vi.fn<typeof fetch>(async (input) => {
            const url = String(input);
            if (url.endsWith('/API/GetNewSession')) {
                return new Response(
                    JSON.stringify({ session_id: `session-for-${new URL(url).host}` })
                );
            }
            return new Response(JSON.stringify({ images: ['/Output/a.png'] }));
        });
        vi.stubGlobal('fetch', fetchMock);

        await generateImages(
            openRouterSettings({
                imageProvider: 'swarm',
                swarmUrl: 'http://first.test',
                swarmModel: 'm'
            }),
            { prompt: 'First', batchCount: 1 }
        );
        await generateImages(
            openRouterSettings({
                imageProvider: 'swarm',
                swarmUrl: 'http://second.test',
                swarmModel: 'm'
            }),
            { prompt: 'Second', batchCount: 1 }
        );

        const sessionRequests = fetchMock.mock.calls.filter(([url]) =>
            String(url).endsWith('/API/GetNewSession')
        );
        expect(sessionRequests).toHaveLength(2);
        const sessions = fetchMock.mock.calls
            .filter(([url]) => String(url).endsWith('/API/GenerateText2Image'))
            .map(([, init]) => JSON.parse(String(init?.body)).session_id);
        expect(sessions).toEqual(['session-for-first.test', 'session-for-second.test']);
    });

    it('keeps images from earlier requests when a later request in the batch fails', async () => {
        const fetchMock = vi
            .fn()
            .mockResolvedValueOnce(
                new Response(JSON.stringify({ data: [{ url: 'https://images.test/first.png' }] }))
            )
            .mockResolvedValueOnce(
                new Response(JSON.stringify({ error: { message: 'Rate limited' } }), {
                    status: 429
                })
            );
        vi.stubGlobal('fetch', fetchMock);

        await expect(
            generateImages(openRouterSettings(), { prompt: 'Two lanterns', batchCount: 3 })
        ).resolves.toEqual([{ url: 'https://images.test/first.png' }]);
        expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('reports the failure when a batch produced no images', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn(
                async () =>
                    new Response(JSON.stringify({ error: { message: 'Rate limited' } }), {
                        status: 429
                    })
            )
        );

        await expect(
            generateImages(openRouterSettings(), { prompt: 'Two lanterns', batchCount: 2 })
        ).rejects.toThrow('Rate limited');
    });
});
