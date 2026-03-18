import { state } from './state.js';
import { generateComfyImages } from './api-comfyui.js';
import {
    editGrokImage,
    generateGrokImages,
    generateGrokVideo,
    resumeGrokVideoStatus
} from './api-grok.js';
import { generateLocalImages } from './api-swarmui.js';
import { persistImageForStorage, persistVideoForStorage } from './media.js';

async function parseJson(response) {
    return response.json().catch(() => ({}));
}

async function jsonRequest(url, options = {}) {
    const response = await fetch(url, {
        method: options.method || 'GET',
        headers: {
            'Content-Type': 'application/json',
            ...(options.headers || {})
        },
        body: options.body != null ? JSON.stringify(options.body) : undefined,
        cache: options.cache || 'no-store'
    });

    const payload = await parseJson(response);
    if (!response.ok) {
        throw new Error(payload.error || `Request failed (${response.status})`);
    }

    return payload;
}

function imageAssetPayload(url, request = {}, metadata = {}) {
    return {
        mediaType: 'image',
        url,
        width: Number.isFinite(request.width) ? request.width : null,
        height: Number.isFinite(request.height) ? request.height : null,
        metadata
    };
}

function videoAssetPayload(url, request = {}, metadata = {}) {
    return {
        mediaType: 'video',
        url,
        thumbnailUrl: request.thumbnailUrl || null,
        durationSeconds: Number.isFinite(request.duration) ? request.duration : null,
        metadata
    };
}

export async function fetchGeneratorJobs(params = {}) {
    const query = new URLSearchParams();
    if (params.limit) query.set('limit', String(params.limit));
    if (params.cursor) query.set('cursor', String(params.cursor));
    if (params.status) query.set('status', params.status);

    const suffix = query.toString() ? `?${query.toString()}` : '';
    return jsonRequest(`/api/generator/jobs${suffix}`, { method: 'GET' });
}

export async function fetchGeneratorAssets(params = {}) {
    const query = new URLSearchParams();
    if (params.limit) query.set('limit', String(params.limit));
    if (params.cursor) query.set('cursor', String(params.cursor));

    const suffix = query.toString() ? `?${query.toString()}` : '';
    return jsonRequest(`/api/generator/assets${suffix}`, { method: 'GET' });
}

export async function createGeneratorJobs(jobs) {
    return jsonRequest('/api/generator/jobs', {
        method: 'POST',
        body: { jobs }
    });
}

export async function updateGeneratorJob(jobId, patch) {
    return jsonRequest(`/api/generator/jobs/${encodeURIComponent(jobId)}`, {
        method: 'PATCH',
        body: patch
    });
}

async function persistGeneratedImages(results, request, metadataBuilder = () => ({})) {
    const assets = [];
    for (let index = 0; index < results.length; index += 1) {
        const result = results[index];
        const storedUrl = await persistImageForStorage(result.url);
        assets.push(imageAssetPayload(storedUrl, request, metadataBuilder(result, index)));
    }
    return assets;
}

export async function executeGeneratorJob(job) {
    const request = job.requestJson || {};

    if (job.mode === 'image_generate' && (job.provider === 'swarm' || job.provider === 'comfy')) {
        const generateImages = job.provider === 'comfy' ? generateComfyImages : generateLocalImages;
        const results = await generateImages({
            prompt: job.prompt,
            negativePrompt: job.negativePrompt || request.negativePrompt || '',
            batchCount: request.batchCount || 1,
            width: request.width,
            height: request.height,
            steps: request.steps,
            cfgScale: request.cfgScale,
            sampler: request.sampler,
            seedMode: request.seedMode,
            baseSeed: request.baseSeed
        });

        const assets = await persistGeneratedImages(results, request, (result, index) => ({
            seed: result.seed,
            index
        }));

        return {
            status: 'succeeded',
            creditsCharged: 0,
            assets
        };
    }

    if (job.mode === 'image_generate') {
        const results = await generateGrokImages({
            prompt: job.prompt,
            batchCount: request.batchCount || 1,
            width: request.width,
            height: request.height,
            aspectRatio: request.aspectRatio,
            resolution: request.resolution
        });

        const assets = await persistGeneratedImages(results, request, (_, index) => ({
            index
        }));

        return {
            status: 'succeeded',
            creditsCharged: state.creditCosts?.image || 0,
            assets
        };
    }

    if (job.mode === 'image_edit') {
        const sourceUrls = Array.isArray(request.sourceUrls)
            ? request.sourceUrls.filter(Boolean).slice(0, 3)
            : [];
        const results = await editGrokImage({
            prompt: job.prompt,
            image: sourceUrls[0] || null,
            images: sourceUrls.length > 1 ? sourceUrls : null,
            aspectRatio: request.aspectRatio,
            resolution: request.resolution
        });

        const assets = await persistGeneratedImages(results, request, (_, index) => ({
            index,
            sourceUrls
        }));

        return {
            status: 'succeeded',
            creditsCharged: state.creditCosts?.image || 0,
            assets
        };
    }

    if (job.mode === 'video_generate') {
        const sourceUrl = Array.isArray(request.sourceUrls) ? request.sourceUrls[0] : null;
        const started = await generateGrokVideo({
            prompt: job.prompt,
            imageUrl: sourceUrl,
            duration: request.duration,
            aspectRatio: request.aspectRatio,
            resolution: request.resolution
        });

        if (started.url) {
            const storedUrl = await persistVideoForStorage(started.url);
            return {
                status: 'succeeded',
                creditsCharged: state.creditCosts?.video || 0,
                assets: [
                    videoAssetPayload(storedUrl, request, {
                        sourceUrl
                    })
                ]
            };
        }

        return {
            status: 'polling',
            creditsCharged: state.creditCosts?.video || 0,
            providerRequestId: started.requestId
        };
    }

    throw new Error(`Unsupported generator job mode: ${job.mode}`);
}

export async function pollVideoGeneratorJob(job) {
    if (!job.providerRequestId) {
        throw new Error('Missing video provider request ID.');
    }

    const status = await resumeGrokVideoStatus(job.providerRequestId);
    if (status.url) {
        const request = job.requestJson || {};
        const storedUrl = await persistVideoForStorage(status.url);
        return {
            done: true,
            failed: false,
            status: 'succeeded',
            creditsCharged: state.creditCosts?.video || 0,
            assets: [
                videoAssetPayload(storedUrl, request, {
                    sourceUrl: Array.isArray(request.sourceUrls) ? request.sourceUrls[0] : null
                })
            ]
        };
    }

    if (
        status.status === 'failed' ||
        status.status === 'error' ||
        status.status === 'cancelled' ||
        status.status === 'expired'
    ) {
        return {
            done: true,
            failed: true,
            errorMessage: status.errorMessage || 'Video generation failed.'
        };
    }

    return {
        done: false,
        failed: false,
        providerRequestId: status.requestId || job.providerRequestId
    };
}
