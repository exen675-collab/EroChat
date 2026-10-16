import { afterEach, describe, expect, it, vi } from 'vitest';
import { defaultSettings } from '../src/client/config.ts';
import { generateImages } from '../src/client/modern/api.ts';
import { formatLoras, parseLoras } from '../src/client/modern/media-presets.ts';
import type { ModernSettings } from '../src/client/modern/types.ts';

const loras = [
    { name: 'portrait-style', weight: 0.8 },
    { name: 'detail', weight: 1 }
];

describe('LoRA settings', () => {
    afterEach(() => {
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
    });

    it('reads names with optional weights and formats them back', () => {
        expect(parseLoras('portrait-style:0.8, detail')).toEqual(loras);
        expect(parseLoras('folder/name:v2:0.5, half:, , :1')).toEqual([
            { name: 'folder/name:v2', weight: 0.5 },
            { name: 'half', weight: 1 }
        ]);
        expect(parseLoras('style:v2')).toEqual([{ name: 'style:v2', weight: 1 }]);
        expect(formatLoras(loras)).toBe('portrait-style:0.8, detail:1');
        expect(parseLoras(formatLoras(loras))).toEqual(loras);
    });

    it('sends LoRA names and weights to SwarmUI', async () => {
        const fetchMock = vi.fn<typeof fetch>(async (input) =>
            String(input).endsWith('/API/GetNewSession')
                ? new Response(JSON.stringify({ session_id: 's' }))
                : new Response(JSON.stringify({ images: ['/Output/a.png'] }))
        );
        vi.stubGlobal('fetch', fetchMock);
        await generateImages(
            {
                ...defaultSettings,
                imageProvider: 'swarm',
                swarmUrl: 'http://lora-swarm.test',
                swarmModel: 'm'
            } as ModernSettings,
            { prompt: 'Portrait', loras }
        );

        const [, init] = fetchMock.mock.calls.find(([url]) =>
            String(url).endsWith('/API/GenerateText2Image')
        )!;
        expect(JSON.parse(String(init?.body))).toMatchObject({
            loras: 'portrait-style,detail',
            loraweights: '0.8,1'
        });
    });

    it('chains ComfyUI LoRA loaders between the checkpoint and the sampler', async () => {
        vi.useFakeTimers();
        const fetchMock = vi.fn<typeof fetch>(async (input) => {
            const url = String(input);
            if (url.endsWith('/prompt')) return new Response(JSON.stringify({ prompt_id: 'p1' }));
            return new Response(
                JSON.stringify({ p1: { outputs: { 7: { images: [{ filename: 'a.png' }] } } } })
            );
        });
        vi.stubGlobal('fetch', fetchMock);
        const running = generateImages(
            {
                ...defaultSettings,
                imageProvider: 'comfy',
                comfyUrl: 'http://comfy.test',
                comfyModel: 'base.safetensors'
            } as ModernSettings,
            { prompt: 'Portrait', loras }
        );
        await vi.advanceTimersByTimeAsync(1000);
        await running;
        vi.useRealTimers();

        const [, init] = fetchMock.mock.calls.find(([url]) => String(url).endsWith('/prompt'))!;
        const workflow = JSON.parse(String(init?.body)).prompt;
        expect(workflow[10].inputs).toMatchObject({
            lora_name: 'portrait-style',
            strength_model: 0.8,
            model: ['1', 0],
            clip: ['1', 1]
        });
        expect(workflow[11].inputs).toMatchObject({
            lora_name: 'detail',
            model: ['10', 0],
            clip: ['10', 1]
        });
        expect(workflow[2].inputs.clip).toEqual(['11', 1]);
        expect(workflow[3].inputs.clip).toEqual(['11', 1]);
        expect(workflow[5].inputs.model).toEqual(['11', 0]);
    });
});
