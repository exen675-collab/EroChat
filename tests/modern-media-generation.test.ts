import { afterEach, describe, expect, it, vi } from 'vitest';
import { defaultGeneratorPrefs, defaultSettings } from '../src/client/config.ts';
import { runMediaGeneration } from '../src/client/modern/media-generation.ts';
import type {
    GeneratorJob,
    MediaGenerationPreset,
    ModernSettings
} from '../src/client/modern/types.ts';

function preset(patch: Partial<MediaGenerationPreset> = {}): MediaGenerationPreset {
    return {
        ...(defaultGeneratorPrefs.presets[0] as MediaGenerationPreset),
        provider: 'openrouter',
        providerModel: 'openai/gpt-image-1',
        ...patch
    };
}

function settings(): ModernSettings {
    return {
        ...defaultSettings,
        openrouterKey: 'sk-test'
    } as ModernSettings;
}

describe('shared media generation jobs', () => {
    afterEach(() => {
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
    });

    it('records source and linkage, runs the shared lifecycle, and persists the result', async () => {
        const requests: Array<{ url: string; body: any }> = [];
        const statuses: string[] = [];
        const baseJob: GeneratorJob = {
            id: 17,
            mode: 'image_generate',
            provider: 'openrouter',
            status: 'queued',
            source: 'chat',
            mediaType: 'image',
            executionBackend: 'local',
            prompt: 'Moonlit portrait'
        };

        vi.stubGlobal(
            'fetch',
            vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
                const url = String(input);
                const body = init?.body ? JSON.parse(String(init.body)) : null;
                requests.push({ url, body });
                if (url === '/api/generator/jobs') {
                    return new Response(JSON.stringify({ jobs: [baseJob] }), { status: 201 });
                }
                if (url === '/api/generator/jobs/17') {
                    return new Response(
                        JSON.stringify({
                            job: { ...baseJob, status: body.status },
                            assets:
                                body.status === 'completed'
                                    ? [
                                          {
                                              id: 91,
                                              mediaType: 'image',
                                              url: '/app/media/generated.png',
                                              source: 'chat'
                                          }
                                      ]
                                    : []
                        }),
                        { status: 200 }
                    );
                }
                if (url === 'https://openrouter.ai/api/v1/images') {
                    return new Response(
                        JSON.stringify({
                            data: [{ b64_json: 'aW1hZ2U=', media_type: 'image/png' }]
                        }),
                        { status: 200 }
                    );
                }
                if (url === '/api/media/store') {
                    return new Response(JSON.stringify({ url: '/app/media/generated.png' }), {
                        status: 200
                    });
                }
                throw new Error(`Unexpected request: ${url}`);
            })
        );

        const result = await runMediaGeneration({
            settings: settings(),
            preset: preset(),
            prompt: 'Moonlit portrait',
            source: 'chat',
            characterId: 'char-1',
            messageId: 'message-2',
            onJobChange: (job) => statuses.push(job.status)
        });

        expect(result.assets).toEqual([
            expect.objectContaining({ id: 91, source: 'chat', url: '/app/media/generated.png' })
        ]);
        expect(statuses).toEqual(['queued', 'starting', 'loading', 'generating', 'completed']);

        const createBody = requests.find((request) => request.url === '/api/generator/jobs')?.body;
        expect(createBody.jobs[0]).toEqual(
            expect.objectContaining({
                source: 'chat',
                mediaType: 'image',
                presetId: 'chat-default',
                executionBackend: 'local',
                characterId: 'char-1',
                messageId: 'message-2',
                providerModel: 'openai/gpt-image-1'
            })
        );
        expect(
            requests
                .filter((request) => request.url === '/api/generator/jobs/17')
                .map((request) => request.body.status)
        ).toEqual(['starting', 'loading', 'generating', 'completed']);
        expect(requests.at(-1)?.body.assets[0].source).toBe('chat');
    });

    it('persists a failed async-backend job without invoking an image provider', async () => {
        const statuses: string[] = [];
        const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
            const url = String(input);
            const body = init?.body ? JSON.parse(String(init.body)) : null;
            if (url === '/api/generator/jobs') {
                return new Response(
                    JSON.stringify({
                        jobs: [
                            {
                                id: 22,
                                mode: 'image_generate',
                                provider: 'openrouter',
                                status: 'queued',
                                source: 'manual',
                                mediaType: 'image',
                                executionBackend: 'runpod',
                                prompt: 'Test'
                            }
                        ]
                    }),
                    { status: 201 }
                );
            }
            if (url === '/api/generator/jobs/22') {
                return new Response(
                    JSON.stringify({
                        job: {
                            id: 22,
                            mode: 'image_generate',
                            provider: 'openrouter',
                            source: 'manual',
                            mediaType: 'image',
                            executionBackend: 'runpod',
                            prompt: 'Test',
                            status: body.status,
                            errorMessage: body.errorMessage
                        },
                        assets: []
                    }),
                    { status: 200 }
                );
            }
            throw new Error(`Unexpected provider request: ${url}`);
        });
        vi.stubGlobal('fetch', fetchMock);

        await expect(
            runMediaGeneration({
                settings: settings(),
                preset: preset({ executionBackend: 'runpod' }),
                prompt: 'Test',
                source: 'manual',
                onJobChange: (job) => statuses.push(job.status)
            })
        ).rejects.toThrow('RunPod execution is not configured yet.');

        expect(statuses).toEqual(['queued', 'starting', 'loading', 'failed']);
        expect(
            fetchMock.mock.calls.some(([url]) =>
                String(url).includes('openrouter.ai/api/v1/images')
            )
        ).toBe(false);
    });
});
