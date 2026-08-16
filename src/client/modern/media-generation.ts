import {
    createGeneratorJob,
    generateImages,
    saveGeneratedJobAssets,
    updateGeneratorJob
} from './api.js';
import { modelForProvider, presetRequest } from './media-presets.js';
import type {
    GeneratorAsset,
    GeneratorJob,
    MediaGenerationPreset,
    MediaJobSource,
    ModernSettings
} from './types.js';

export interface RunMediaGenerationInput {
    settings: ModernSettings;
    preset: MediaGenerationPreset;
    prompt: string;
    negativePrompt?: string;
    source: MediaJobSource;
    characterId?: string;
    messageId?: string;
    batchCount?: number;
    onJobChange?: (job: GeneratorJob) => void;
}

export interface RunMediaGenerationResult {
    job: GeneratorJob;
    assets: GeneratorAsset[];
}

export async function runMediaGeneration(
    input: RunMediaGenerationInput
): Promise<RunMediaGenerationResult> {
    const request = presetRequest(input.preset, input.batchCount || 1);
    const providerModel = modelForProvider(input.settings, input.preset);
    const [createdJob] = await createGeneratorJob({
        batchId: crypto.randomUUID(),
        mode: input.preset.mediaType === 'video' ? 'video_generate' : 'image_generate',
        mediaType: input.preset.mediaType,
        source: input.source,
        provider: input.preset.provider,
        prompt: input.prompt,
        negativePrompt: input.negativePrompt,
        providerModel,
        presetId: input.preset.id,
        executionBackend: input.preset.executionBackend,
        characterId: input.characterId,
        messageId: input.messageId,
        sourceAssetIds: [],
        requestJson: request
    });

    if (!createdJob) throw new Error('The media job could not be created.');
    let job = createdJob;
    input.onJobChange?.(job);

    const transition = async (status: GeneratorJob['status']) => {
        const result = await updateGeneratorJob(job.id, { status });
        job = result.job || { ...job, status };
        input.onJobChange?.(job);
    };

    try {
        await transition('starting');
        await transition('loading');
        if (input.preset.executionBackend === 'runpod') {
            throw new Error('RunPod execution is not configured yet.');
        }
        if (input.preset.mediaType === 'video') {
            throw new Error('Video generation is not configured for this provider yet.');
        }

        await transition('generating');
        const settings = {
            ...input.settings,
            imageProvider: input.preset.provider
        } as ModernSettings;
        const results = await generateImages(settings, {
            prompt: input.prompt,
            negativePrompt: input.negativePrompt,
            model: providerModel,
            ...request
        });
        const completed = await saveGeneratedJobAssets(job, results, request, {
            mediaType: input.preset.mediaType,
            source: input.source
        });
        job = completed.job || { ...job, status: 'completed' };
        input.onJobChange?.(job);
        return { job, assets: completed.assets || [] };
    } catch (error) {
        const message = (error as Error).message;
        try {
            const failed = await updateGeneratorJob(job.id, {
                status: 'failed',
                errorMessage: message,
                completedAt: new Date().toISOString()
            });
            job = failed.job || { ...job, status: 'failed', errorMessage: message };
            input.onJobChange?.(job);
        } catch {
            // Preserve the original provider error if status persistence also fails.
        }
        throw error;
    }
}
