import { state } from './state.js';
import { elements } from './dom.js';
import { generateLocalImage } from './api-swarmui.js';
import { generateGrokImage, generateGrokVideoFromImage } from './api-grok.js';

export async function generateImage(prompt, width = null, height = null) {
    const imageProvider = elements.imageProvider.value || state.settings.imageProvider || 'local';
    if (imageProvider === 'grok') {
        try {
            elements.imageIndicator.classList.remove('hidden');
            return await generateGrokImage(prompt, width, height);
        } finally {
            elements.imageIndicator.classList.add('hidden');
        }
    }

    return generateLocalImage(prompt, width, height);
}

export async function generateVideoFromImage(imageUrl) {
    return generateGrokVideoFromImage(imageUrl);
}
