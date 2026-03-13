import { state } from './state.js';
import { elements } from './dom.js';
import { generateComfyImage, generateComfyImages } from './api-comfyui.js';
import { generateGrokImage, generateGrokImages, generateGrokVideoFromImage } from './api-grok.js';
import { generateLocalImage, generateLocalImages } from './api-swarmui.js';
import { normalizeImageProvider } from './utils.js';

export async function generateImage(prompt, width = null, height = null) {
    const imageProvider = normalizeImageProvider(elements.imageProvider.value || state.settings.imageProvider || 'swarm');
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

    return generateLocalImage(prompt, width, height);
}

export async function generateImageBatch(options = {}) {
    const imageProvider = normalizeImageProvider(options.provider || elements.imageProvider.value || state.settings.imageProvider || 'swarm');
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
