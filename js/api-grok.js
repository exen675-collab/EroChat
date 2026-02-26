import { elements } from './dom.js';
import { state } from './state.js';

export const PREMIUM_CHAT_MODEL = 'grok-4-1-fast-reasoning';

function setCredits(credits) {
    const numericCredits = Number.parseInt(credits, 10);
    if (!Number.isFinite(numericCredits)) return;

    if (!state.currentUser) {
        state.currentUser = {};
    }
    state.currentUser.credits = numericCredits;

    if (elements.currentCredits) {
        elements.currentCredits.textContent = String(numericCredits);
    }
}

function updateCreditsTooltip() {
    if (!elements.currentCredits || !state.creditCosts) return;
    const costs = state.creditCosts;
    elements.currentCredits.title = `Premium costs - Chat: ${costs.chat}, Image: ${costs.image}, Video: ${costs.video}`;
}

function applyCreditsMetadata(meta) {
    if (meta && Number.isFinite(meta.remaining)) {
        setCredits(meta.remaining);
    }
}

async function parseJsonResponse(response) {
    return response.json().catch(() => ({}));
}

async function postToGrokProxy(endpoint, payload) {
    const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
    });

    const data = await parseJsonResponse(response);
    if (!response.ok) {
        throw new Error(data.error || `Request failed (${response.status})`);
    }

    applyCreditsMetadata(data?._credits);
    return data;
}

export async function fetchCreditsSummary(silent = false) {
    try {
        const response = await fetch('/api/credits/me', { cache: 'no-store' });
        const data = await parseJsonResponse(response);

        if (!response.ok) {
            throw new Error(data.error || 'Failed to fetch credits.');
        }

        if (Number.isFinite(data.credits)) {
            setCredits(data.credits);
        }

        state.creditCosts = data.costs || null;
        updateCreditsTooltip();
        return data;
    } catch (error) {
        if (!silent) {
            alert(`Failed to load credits: ${error.message}`);
        }
        throw error;
    }
}

export async function sendGrokChatRequest(apiMessages, options = {}) {
    const payload = {
        model: PREMIUM_CHAT_MODEL,
        messages: apiMessages,
        temperature: options.temperature ?? 0.9,
        max_tokens: options.maxTokens ?? 2000
    };

    const data = await postToGrokProxy('/api/premium/chat', payload);
    return data.choices?.[0]?.message?.content || '';
}

export async function generateGrokImage(prompt, width = null, height = null) {
    const w = width ? parseInt(width, 10) : parseInt(elements.imgWidth.value, 10);
    const h = height ? parseInt(height, 10) : parseInt(elements.imgHeight.value, 10);

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

    body.resolution = Math.max(w, h) > 1408 ? '2k' : '1k';

    let data;
    try {
        data = await postToGrokProxy('/api/premium/image', body);
    } catch (error) {
        const canRetryWithMinimalPayload = /400|aspect|resolution|parameter|payload/i.test(String(error.message));
        if (!canRetryWithMinimalPayload) {
            throw error;
        }

        data = await postToGrokProxy('/api/premium/image', {
            model: 'grok-imagine-image',
            prompt,
            n: 1,
            response_format: 'b64_json'
        });
    }

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
    const preparedImageUrl = await prepareImageForVideoGeneration(imageUrl);

    const startData = await postToGrokProxy('/api/premium/video', {
        model: 'grok-imagine-video',
        prompt: 'Animate this image into a short cinematic video.',
        duration: 4,
        resolution: '480p',
        image: { url: preparedImageUrl }
    });

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

        const statusResponse = await fetch(`/api/premium/video/${encodeURIComponent(requestId)}`, {
            method: 'GET',
            cache: 'no-store'
        });

        const statusData = await parseJsonResponse(statusResponse);

        if (!statusResponse.ok) {
            if (statusResponse.status === 202 || statusResponse.status === 429) {
                delayMs = Math.min(delayMs + 1000, 7000);
                continue;
            }

            throw new Error(statusData.error || `Failed to check video status (${statusResponse.status})`);
        }

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
