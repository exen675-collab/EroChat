import { state } from './state.js';
import { elements } from './dom.js';
import { generateComfyImage, generateComfyImages } from './api-comfyui.js';
import { createGeneratorJobs, fetchGeneratorAssets, fetchGeneratorJob } from './api-generator.js';
import { generateGrokImage, generateGrokImages, generateGrokVideoFromImage } from './api-grok.js';
import { generateLocalImages } from './api-swarmui.js';
import { normalizeImageProvider, normalizeSwarmSampler } from './utils.js';

const REMOTE_SWARM_POLL_MS = 2500;
const REMOTE_SWARM_MAX_POLLS = 240;

function wait(ms) {
    return new Promise((resolve) => {
        window.setTimeout(resolve, ms);
    });
}

function buildRemoteSwarmJobRequest(prompt, width, height) {
    const resolvedWidth = Number.isFinite(width) ? Math.trunc(width) : state.settings.imgWidth;
    const resolvedHeight = Number.isFinite(height)
        ? Math.trunc(height)
        : state.settings.imgHeight;

    return {
        batchId: `chat_swarm_${Date.now()}`,
        mode: 'image_generate',
        provider: 'swarm',
        prompt,
        negativePrompt: '',
        providerModel: 'swarmui',
        requestJson: {
            batchCount: 1,
            model: state.settings.swarmModel || elements.swarmModel.value || '',
            width: resolvedWidth,
            height: resolvedHeight,
            steps: state.settings.steps,
            cfgScale: state.settings.cfgScale,
            sampler: normalizeSwarmSampler(state.settings.sampler),
            seedMode: 'random',
            baseSeed: 1
        }
    };
}

async function waitForRemoteSwarmImage(jobId) {
    for (let attempt = 0; attempt < REMOTE_SWARM_MAX_POLLS; attempt += 1) {
        const payload = await fetchGeneratorJob(jobId);
        const job = payload?.job;
        if (!job) {
            throw new Error('Remote SwarmUI job disappeared.');
        }

        if (job.status === 'succeeded') {
            const assetsPayload = await fetchGeneratorAssets({ limit: 20 });
            const asset = (assetsPayload.assets || []).find((entry) => entry.jobId === job.id);
            if (asset?.url) {
                return asset.url;
            }
            throw new Error('Remote SwarmUI job completed without an image asset.');
        }

        if (job.status === 'failed' || job.status === 'interrupted') {
            throw new Error(job.errorMessage || 'Remote SwarmUI generation failed.');
        }

        await wait(REMOTE_SWARM_POLL_MS);
    }

    throw new Error('Timed out waiting for the remote SwarmUI worker.');
}

async function generateRemoteSwarmImage(prompt, width = null, height = null) {
    const payload = await createGeneratorJobs([buildRemoteSwarmJobRequest(prompt, width, height)]);
    const job = Array.isArray(payload.jobs) ? payload.jobs[0] : null;
    if (!job?.id) {
        throw new Error('Failed to queue the remote SwarmUI job.');
    }
    return waitForRemoteSwarmImage(job.id);
}

export async function generateImage(prompt, width = null, height = null) {
    const imageProvider = normalizeImageProvider(
        elements.imageProvider.value || state.settings.imageProvider || 'swarm'
    );
    if (imageProvider === 'premium') {
        try {
            elements.imageIndicator.classList.remove('hidden');
            return await generateGrokImage(prompt, width, height);
        } finally {
            elements.imageIndicator.classList.add('hidden');
        }
    }

    if (imageProvider === 'comfy') {
        return generateComfyImage(prompt, width, height);
    }

    try {
        elements.imageIndicator.classList.remove('hidden');
        return await generateRemoteSwarmImage(prompt, width, height);
    } finally {
        elements.imageIndicator.classList.add('hidden');
    }
}

export async function generateImageBatch(options = {}) {
    const imageProvider = normalizeImageProvider(
        options.provider || elements.imageProvider.value || state.settings.imageProvider || 'swarm'
    );
    if (imageProvider === 'premium' || imageProvider === 'grok') {
        try {
            elements.imageIndicator.classList.remove('hidden');
            return await generateGrokImages(options);
        } finally {
            elements.imageIndicator.classList.add('hidden');
        }
    }

    if (imageProvider === 'comfy') {
        return generateComfyImages(options);
    }

    return generateLocalImages(options);
}

export async function generateVideoFromImage(imageUrl) {
    return generateGrokVideoFromImage(imageUrl);
}
