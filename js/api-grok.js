import { elements } from './dom.js';
import { state } from './state.js';

let fetchedGrokModels = [];

function filterAndPopulateGrokModels(searchQuery = '', preferredModelId = null) {
    const query = searchQuery.toLowerCase().trim();
    const previousValue = preferredModelId || elements.grokModel.value || state.settings.grokModel;

    elements.grokModel.innerHTML = '<option value="">Select a model...</option>';

    const filteredModels = query
        ? fetchedGrokModels.filter(model =>
            model.name.toLowerCase().includes(query) || model.id.toLowerCase().includes(query)
        )
        : fetchedGrokModels;

    filteredModels.forEach(model => {
        const option = document.createElement('option');
        option.value = model.id;
        option.textContent = `${model.name} (${model.id})`;
        elements.grokModel.appendChild(option);
    });

    if (previousValue && filteredModels.some(model => model.id === previousValue)) {
        elements.grokModel.value = previousValue;
    }

    if (query && filteredModels.length > 0) {
        elements.grokModel.options[0].textContent = `Select a model (${filteredModels.length} found)...`;
    } else if (query && filteredModels.length === 0) {
        elements.grokModel.options[0].textContent = 'No models match your search';
    } else {
        elements.grokModel.options[0].textContent = 'Select a model...';
    }
}

export function setupGrokModelSearch() {
    elements.grokModelSearch.addEventListener('input', (e) => {
        filterAndPopulateGrokModels(e.target.value);
    });
}

export async function fetchGrokModels(silent = false) {
    if (typeof silent !== 'boolean') silent = false;
    const apiKey = elements.grokKey.value;

    if (!apiKey) {
        if (!silent) alert('Please enter your Grok API key first.');
        return;
    }

    try {
        elements.fetchGrokModelsBtn.disabled = true;
        elements.fetchGrokModelsBtn.innerHTML = `
            <div class="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin"></div>
            Fetching...
        `;

        const response = await fetch('https://api.x.ai/v1/models', {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${apiKey}`
            }
        });

        if (!response.ok) {
            throw new Error('Failed to fetch models. Check your API key.');
        }

        const data = await response.json();
        fetchedGrokModels = (data.data || [])
            .filter(model => typeof model?.id === 'string')
            .map(model => ({ id: model.id, name: model.id }));

        elements.grokModelSearch.value = '';
        elements.grokModelSearch.disabled = false;
        elements.grokModelSearch.placeholder = 'Type to search models...';

        filterAndPopulateGrokModels('', state.settings.grokModel);

        if (!silent) alert(`Successfully fetched ${fetchedGrokModels.length} models from Grok API!`);
    } catch (error) {
        console.error('Error fetching Grok models:', error);
        if (!silent) alert('Failed to fetch models: ' + error.message);
    } finally {
        elements.fetchGrokModelsBtn.disabled = false;
        elements.fetchGrokModelsBtn.innerHTML = `
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path>
            </svg>
            Load Grok Models
        `;
    }
}

export async function sendGrokChatRequest(apiMessages) {
    const response = await fetch('https://api.x.ai/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${elements.grokKey.value}`
        },
        body: JSON.stringify({
            model: elements.grokModel.value,
            messages: apiMessages,
            temperature: 0.9,
            max_tokens: 2000
        })
    });

    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error?.message || 'Failed to get response');
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content || '';
}

export async function generateGrokImage(prompt, width = null, height = null) {
    const w = width ? parseInt(width) : parseInt(elements.imgWidth.value);
    const h = height ? parseInt(height) : parseInt(elements.imgHeight.value);

    const body = {
        model: 'grok-imagine-image',
        prompt,
        n: 1,
        response_format: 'b64_json'
    };

    const aspectRatio = pickAspectRatio(w, h);
    if (aspectRatio) {
        body.aspect_ratio = aspectRatio;
    }

    // xAI docs currently support 1k and 2k resolution flags.
    body.resolution = Math.max(w, h) > 1408 ? '2k' : '1k';

    let response = await fetch('https://api.x.ai/v1/images/generations', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${elements.grokKey.value}`
        },
        body: JSON.stringify(body)
    });

    // Retry with minimal payload if provider rejects optional parameters.
    if (!response.ok && response.status === 400) {
        response = await fetch('https://api.x.ai/v1/images/generations', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${elements.grokKey.value}`
            },
            body: JSON.stringify({
                model: 'grok-imagine-image',
                prompt,
                n: 1,
                response_format: 'b64_json'
            })
        });
    }

    if (!response.ok) {
        let errorMessage = `Failed to generate image (${response.status})`;
        try {
            const error = await response.json();
            errorMessage = error.error?.message || errorMessage;
        } catch {
            try {
                const rawText = await response.text();
                if (rawText) errorMessage = rawText;
            } catch {
                // ignore parsing failures
            }
        }
        throw new Error(errorMessage);
    }

    const data = await response.json();
    const image = data.data?.[0];

    if (!image) {
        throw new Error('No image generated');
    }

    if (image.b64_json) {
        return `data:image/png;base64,${image.b64_json}`;
    }

    if (image.url) {
        return image.url;
    }

    throw new Error('No image generated');
}

export async function generateGrokVideoFromImage(imageUrl) {
    if (!elements.grokKey.value) {
        throw new Error('Missing Grok API key');
    }

    const preparedImageUrl = await prepareImageForVideoGeneration(imageUrl);

    const startResponse = await fetch('https://api.x.ai/v1/videos/generations', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${elements.grokKey.value}`
        },
        body: JSON.stringify({
            model: 'grok-imagine-video',
            prompt: 'Animate this image into a short cinematic video.',
            duration: 4,
            resolution: '480p',
            image: { url: preparedImageUrl }
        })
    });

    if (!startResponse.ok) {
        let errorMessage = `Failed to start video generation (${startResponse.status})`;
        try {
            const error = await startResponse.json();
            errorMessage = error.error?.message || errorMessage;
        } catch {
            // ignore parsing failures
        }
        throw new Error(errorMessage);
    }

    const startData = await startResponse.json();
    const immediateVideoUrl =
        startData.video?.url ||
        startData.url ||
        startData.video_url ||
        startData.output?.url ||
        startData.data?.video?.url ||
        startData.data?.url ||
        startData.data?.video_url ||
        startData.data?.output?.url;
    if (immediateVideoUrl) {
        return immediateVideoUrl;
    }

    const requestId = startData.request_id || startData.id || startData.data?.request_id || startData.data?.id;
    if (!requestId) {
        throw new Error('Video request created but no request ID was returned.');
    }

    const maxWaitMs = 12 * 60 * 1000;
    const startTime = Date.now();
    let delayMs = 3000;
    let lastKnownStatus = 'unknown';

    while (Date.now() - startTime < maxWaitMs) {
        await new Promise(resolve => setTimeout(resolve, delayMs));

        const statusResponse = await fetch(`https://api.x.ai/v1/videos/${requestId}`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${elements.grokKey.value}`
            }
        });

        if (!statusResponse.ok) {
            if (statusResponse.status === 202 || statusResponse.status === 429) {
                delayMs = Math.min(delayMs + 1000, 7000);
                continue;
            }

            let errorMessage = `Failed to check video status (${statusResponse.status})`;
            try {
                const error = await statusResponse.json();
                errorMessage = error.error?.message || errorMessage;
            } catch {
                // ignore parsing failures
            }
            throw new Error(errorMessage);
        }

        const statusData = await statusResponse.json();
        const statusVideoUrl =
            statusData.video?.url ||
            statusData.url ||
            statusData.video_url ||
            statusData.output?.url ||
            statusData.data?.video?.url ||
            statusData.data?.url ||
            statusData.data?.video_url ||
            statusData.data?.output?.url;
        if (statusVideoUrl) {
            return statusVideoUrl;
        }

        const status = (statusData.status || statusData.data?.status || '').toLowerCase();
        if (status) {
            lastKnownStatus = status;
        }

        if (status === 'failed' || status === 'error' || status === 'cancelled' || status === 'expired') {
            const failureReason = statusData.error?.message || statusData.message || 'Video generation failed.';
            throw new Error(failureReason);
        }

        if (status === 'completed' || status === 'done' || status === 'succeeded') {
            throw new Error('Video generation completed but no video URL was returned.');
        }

        delayMs = Math.min(delayMs + 500, 7000);
    }

    throw new Error(`Timed out while waiting for video generation to finish (last status: ${lastKnownStatus}).`);
}

function isLocalOrPrivateUrl(rawUrl) {
    try {
        const parsed = new URL(rawUrl, window.location.href);
        if (!/^https?:$/i.test(parsed.protocol)) return true;

        const host = parsed.hostname.toLowerCase();
        if (host === 'localhost' || host === '127.0.0.1' || host === '0.0.0.0' || host === '::1') return true;
        if (host.endsWith('.local')) return true;

        const privateIpV4 = /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[0-1])\.)/;
        return privateIpV4.test(host);
    } catch {
        return true;
    }
}

async function prepareImageForVideoGeneration(imageUrl) {
    if (!imageUrl || typeof imageUrl !== 'string') {
        throw new Error('Invalid image URL for video generation.');
    }

    if (imageUrl.startsWith('data:image/')) {
        return imageUrl;
    }

    const shouldConvertToDataUri =
        imageUrl.startsWith('blob:') ||
        imageUrl.startsWith('file:') ||
        imageUrl.startsWith('/') ||
        !/^https?:\/\//i.test(imageUrl) ||
        isLocalOrPrivateUrl(imageUrl);

    if (!shouldConvertToDataUri) {
        return imageUrl;
    }

    const absoluteUrl = new URL(imageUrl, window.location.href).toString();

    try {
        const response = await fetch(absoluteUrl);
        if (!response.ok) {
            throw new Error(`Could not fetch source image (${response.status}).`);
        }

        const blob = await response.blob();
        const mime = blob.type && blob.type.startsWith('image/') ? blob.type : 'image/png';
        const base64 = await blobToBase64(blob);
        return `data:${mime};base64,${base64}`;
    } catch (error) {
        throw new Error(
            `Source image is not publicly accessible and could not be converted for upload (${error.message}).`
        );
    }
}

function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
            const result = reader.result;
            if (typeof result !== 'string') {
                reject(new Error('Failed to read image data.'));
                return;
            }
            const commaIndex = result.indexOf(',');
            resolve(commaIndex >= 0 ? result.slice(commaIndex + 1) : result);
        };
        reader.onerror = () => reject(new Error('Failed to read image data.'));
        reader.readAsDataURL(blob);
    });
}

function pickAspectRatio(width, height) {
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
        return 'auto';
    }

    const target = width / height;
    const supported = ['1:1', '16:9', '9:16', '4:3', '3:4', '3:2', '2:3', '2:1', '1:2', '19.5:9', '9:19.5', '20:9', '9:20'];

    let best = 'auto';
    let bestDiff = Number.POSITIVE_INFINITY;
    for (const ratio of supported) {
        const [rw, rh] = ratio.split(':').map(Number);
        const value = rw / rh;
        const diff = Math.abs(value - target);
        if (diff < bestDiff) {
            bestDiff = diff;
            best = ratio;
        }
    }

    return best;
}
