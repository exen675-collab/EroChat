import { state } from './state.js';
import { elements } from './dom.js';
import { generateLocalImage, generateLocalImages } from './api-swarmui.js';
import { generateGrokImage, generateGrokImages, generateGrokVideoFromImage } from './api-grok.js';

export async function generateImage(prompt, width = null, height = null) {
    const imageProvider = elements.imageProvider.value || state.settings.imageProvider || 'local';
    if (imageProvider === 'premium') {
        try {
            elements.imageIndicator.classList.remove('hidden');
            return await generateGrokImage(prompt, width, height);
        } finally {
            elements.imageIndicator.classList.add('hidden');
        }
    }

    return generateLocalImage(prompt, width, height);
}

export async function generateImageBatch(options = {}) {
    const imageProvider = options.provider || elements.imageProvider.value || state.settings.imageProvider || 'local';
    if (imageProvider === 'premium' || imageProvider === 'grok') {
        try {
            elements.imageIndicator.classList.remove('hidden');
            return await generateGrokImages(options);
        } finally {
            elements.imageIndicator.classList.add('hidden');
        }
    }

    return generateLocalImages(options);
}

export async function generateVideoFromImage(imageUrl) {
    return generateGrokVideoFromImage(imageUrl);
}
