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
