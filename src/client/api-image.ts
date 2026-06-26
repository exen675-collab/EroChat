// @ts-nocheck
import { state } from './state.js';
import { elements } from './dom.js';
import { generateComfyImage, generateComfyImages } from './api-comfyui.js';
import { generateNanoGptImage, generateNanoGptImages } from './api-nanogpt.js';
import { generateLocalImage, generateLocalImages } from './api-swarmui.js';
import { normalizeImageProvider } from './utils.js';

export async function generateImage(prompt, width = null, height = null) {
    const imageProvider = normalizeImageProvider(
        elements.imageProvider.value || state.settings.imageProvider || 'swarm'
    );

    if (imageProvider === 'comfy') {
        return generateComfyImage(prompt, width, height);
    }
    if (imageProvider === 'nanogpt') {
        return generateNanoGptImage(prompt, width, height);
    }

    return generateLocalImage(prompt, width, height);
}

export async function generateImageBatch(options = {}) {
    const imageProvider = normalizeImageProvider(
        options.provider || elements.imageProvider.value || state.settings.imageProvider || 'swarm'
    );

    if (imageProvider === 'comfy') {
        return generateComfyImages(options);
    }
    if (imageProvider === 'nanogpt') {
        return generateNanoGptImages(options);
    }

    return generateLocalImages(options);
}
