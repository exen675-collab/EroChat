import { elements } from './dom.js';
import { state } from './state.js';
import { GROK_TTS_FALLBACK_VOICES } from './utils.js';

export const PREMIUM_CHAT_MODEL = 'grok-4-1-fast-reasoning';
export const DEFAULT_GROK_TTS_LANGUAGE = 'auto';
export const DEFAULT_GROK_TTS_OUTPUT_FORMAT = {
    codec: 'mp3',
    sample_rate: 24000,
    bit_rate: 128000
};

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
    elements.currentCredits.title = `Premium costs - Chat: ${costs.chat}, Image: ${costs.image}, Video: ${costs.video}, TTS: ${costs.tts ?? '--'}`;
}

function applyCreditsMetadata(meta) {
    if (meta && Number.isFinite(meta.remaining)) {
        setCredits(meta.remaining);
    }
}

function applyCreditsHeaders(headers) {
    const remainingCredits = Number.parseInt(headers?.get('X-Credits-Remaining') || '', 10);
    const chargedCost = Number.parseInt(headers?.get('X-Credits-Cost') || '', 10);

    if (Number.isFinite(remainingCredits)) {
        setCredits(remainingCredits);
    }

    if (Number.isFinite(chargedCost)) {
        state.creditCosts = {
            ...(state.creditCosts || {}),
            tts: chargedCost
        };
        updateCreditsTooltip();
    }
}

async function parseJsonResponse(response) {
    return response.json().catch(() => ({}));
}

async function parseErrorResponse(response) {
    const contentType = String(response.headers.get('content-type') || '').toLowerCase();
    if (contentType.includes('application/json')) {
        return parseJsonResponse(response);
    }

    const message = await response.text().catch(() => '');
    return { error: message || `Request failed (${response.status})` };
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

function normalizeImageRecord(record) {
    if (!record) return null;
    if (record.b64_json) {
        return { url: `data:image/png;base64,${record.b64_json}` };
    }
    if (record.url) {
        return { url: record.url };
    }
    return null;
}

function normalizeTtsVoiceRecord(record) {
    const voiceId =
        typeof record?.voice_id === 'string' ? record.voice_id.trim().toLowerCase() : '';

    if (!voiceId) return null;

    return {
        voice_id: voiceId,
        name:
            typeof record?.name === 'string' && record.name.trim()
                ? record.name.trim()
                : voiceId.charAt(0).toUpperCase() + voiceId.slice(1),
        language:
            typeof record?.language === 'string' && record.language.trim()
                ? record.language.trim()
                : 'multilingual'
    };
}

function extractVideoStatus(data) {
    const url =
        data?.video?.url ||
        data?.url ||
        data?.video_url ||
        data?.output?.url ||
        data?.data?.video?.url ||
        data?.data?.url ||
        data?.data?.video_url ||
        data?.data?.output?.url ||
        null;
    const status = (data?.status || data?.data?.status || '').toLowerCase() || null;
    const requestId =
        data?.request_id || data?.id || data?.data?.request_id || data?.data?.id || null;
    const errorMessage = data?.error?.message || data?.message || null;

    return {
        requestId,
        status,
        url,
        errorMessage
    };
}

function isLocalOrPrivateUrl(rawUrl) {
    try {
        const parsed = new URL(rawUrl, window.location.href);
        if (!/^https?:$/i.test(parsed.protocol)) return true;

        const host = parsed.hostname.toLowerCase();
        if (host === 'localhost' || host === '127.0.0.1' || host === '0.0.0.0' || host === '::1')
            return true;
        if (host.endsWith('.local')) return true;

        return /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[0-1])\.)/.test(host);
    } catch {
        return true;
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

async function prepareImageUrlForGrok(rawUrl) {
    if (!rawUrl || typeof rawUrl !== 'string') {
        throw new Error('Invalid image URL.');
    }

    if (rawUrl.startsWith('data:image/')) {
        return rawUrl;
    }

    const shouldConvertToDataUri =
        rawUrl.startsWith('blob:') ||
        rawUrl.startsWith('file:') ||
        rawUrl.startsWith('/') ||
        !/^https?:\/\//i.test(rawUrl) ||
        isLocalOrPrivateUrl(rawUrl);

    if (!shouldConvertToDataUri) {
        return rawUrl;
    }

    const absoluteUrl = new URL(rawUrl, window.location.href).toString();
    const response = await fetch(absoluteUrl);
    if (!response.ok) {
        throw new Error(`Could not fetch source image (${response.status}).`);
    }

    const blob = await response.blob();
    const mime = blob.type && blob.type.startsWith('image/') ? blob.type : 'image/png';
    const base64 = await blobToBase64(blob);
    return `data:${mime};base64,${base64}`;
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

export async function fetchGrokTtsVoices() {
    const response = await fetch('/api/premium/tts/voices', {
        method: 'GET',
        cache: 'no-store'
    });

    const data = await parseJsonResponse(response);
    if (!response.ok) {
        throw new Error(data.error || `Failed to load TTS voices (${response.status}).`);
    }

    const voices = Array.isArray(data?.voices)
        ? data.voices.map(normalizeTtsVoiceRecord).filter(Boolean)
        : [];

    return voices.length > 0 ? voices : [...GROK_TTS_FALLBACK_VOICES];
}

export async function generateGrokSpeechBlob(options = {}) {
    const response = await fetch('/api/premium/tts', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            text: options.text || '',
            voice_id: options.voiceId || options.voice_id,
            language: options.language || DEFAULT_GROK_TTS_LANGUAGE,
            output_format: options.outputFormat || DEFAULT_GROK_TTS_OUTPUT_FORMAT
        })
    });

    if (!response.ok) {
        const errorData = await parseErrorResponse(response);
        throw new Error(errorData.error || `Failed to generate speech (${response.status}).`);
    }

    applyCreditsHeaders(response.headers);
    return response.blob();
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

export function pickAspectRatio(width, height) {
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
        return 'auto';
    }

    const target = width / height;
    const supported = [
        '1:1',
        '16:9',
        '9:16',
        '4:3',
        '3:4',
        '3:2',
        '2:3',
        '2:1',
        '1:2',
        '19.5:9',
        '9:19.5',
        '20:9',
        '9:20'
    ];

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

function resolveImageResolution(width, height, fallback = '1k') {
    if (width && height) {
        return Math.max(width, height) > 1408 ? '2k' : '1k';
    }
    return fallback;
}

export async function generateGrokImages(options) {
    const width = Number.isFinite(options?.width) ? options.width : null;
    const height = Number.isFinite(options?.height) ? options.height : null;
    const payload = {
        model: options?.model || 'grok-imagine-image',
        prompt: options?.prompt || '',
        n: Number.isFinite(options?.batchCount)
            ? options.batchCount
            : Number.isFinite(options?.n)
              ? options.n
              : 1,
        response_format: options?.responseFormat || 'b64_json'
    };

    if (options?.aspectRatio) {
        payload.aspect_ratio = options.aspectRatio;
    } else if (width && height) {
        payload.aspect_ratio = pickAspectRatio(width, height);
    }

    payload.resolution = options?.resolution || resolveImageResolution(width, height, '1k');

    const data = await postToGrokProxy('/api/premium/image', payload);
    return (data?.data || []).map(normalizeImageRecord).filter(Boolean);
}

export async function generateGrokImage(prompt, width = null, height = null) {
    const images = await generateGrokImages({ prompt, width, height, batchCount: 1 });
    const image = images[0];
    if (!image?.url) {
        throw new Error('No image generated');
    }
    return image.url;
}

export async function editGrokImage(options) {
    const payload = {
        model: options?.model || 'grok-imagine-image',
        prompt: options?.prompt || '',
        response_format: options?.responseFormat || 'b64_json'
    };

    if (options?.aspectRatio) {
        payload.aspect_ratio = options.aspectRatio;
    }
    if (options?.resolution) {
        payload.resolution = options.resolution;
    }

    if (Array.isArray(options?.images) && options.images.length > 0) {
        payload.images = await Promise.all(
            options.images.slice(0, 3).map(async (imageUrl) => ({
                url: await prepareImageUrlForGrok(imageUrl),
                type: 'image_url'
            }))
        );
    } else if (options?.image) {
        payload.image = {
            url: await prepareImageUrlForGrok(options.image),
            type: 'image_url'
        };
    } else {
        throw new Error('At least one source image is required.');
    }

    const data = await postToGrokProxy('/api/premium/image/edit', payload);
    return (data?.data || []).map(normalizeImageRecord).filter(Boolean);
}

export async function generateGrokVideo(options) {
    const payload = {
        model: options?.model || 'grok-imagine-video',
        prompt: options?.prompt || 'Animate this image into a short cinematic video.',
        duration: Number.isFinite(options?.duration) ? options.duration : 4,
        resolution: options?.resolution || '480p',
        image: {
            url: await prepareImageUrlForGrok(options?.imageUrl)
        }
    };

    if (options?.aspectRatio) {
        payload.aspect_ratio = options.aspectRatio;
    }

    const data = await postToGrokProxy('/api/premium/video', payload);
    return extractVideoStatus(data);
}

export async function resumeGrokVideoStatus(requestId) {
    const response = await fetch(`/api/premium/video/${encodeURIComponent(requestId)}`, {
        method: 'GET',
        cache: 'no-store'
    });

    const data = await parseJsonResponse(response);
    if (!response.ok) {
        throw new Error(data.error || `Failed to check video status (${response.status})`);
    }

    return extractVideoStatus(data);
}

async function waitForGrokVideoResult(requestId) {
    const maxWaitMs = 12 * 60 * 1000;
    const startTime = Date.now();
    let delayMs = 3000;
    let lastKnownStatus = 'unknown';

    while (Date.now() - startTime < maxWaitMs) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        const status = await resumeGrokVideoStatus(requestId);

        if (status.url) {
            return status.url;
        }
        if (status.status) {
            lastKnownStatus = status.status;
        }
        if (
            status.status === 'failed' ||
            status.status === 'error' ||
            status.status === 'cancelled' ||
            status.status === 'expired'
        ) {
            throw new Error(status.errorMessage || 'Video generation failed.');
        }
        if (
            status.status === 'completed' ||
            status.status === 'done' ||
            status.status === 'succeeded'
        ) {
            throw new Error('Video generation completed but no video URL was returned.');
        }

        delayMs = Math.min(delayMs + 500, 7000);
    }

    throw new Error(
        `Timed out while waiting for video generation to finish (last status: ${lastKnownStatus}).`
    );
}

export async function generateGrokVideoFromImage(imageUrl) {
    const started = await generateGrokVideo({
        imageUrl,
        prompt: 'Animate this image into a short cinematic video.',
        duration: 4,
        resolution: '480p',
        aspectRatio: '16:9'
    });

    if (started.url) {
        return started.url;
    }
    if (!started.requestId) {
        throw new Error('Video request created but no request ID was returned.');
    }
    return waitForGrokVideoResult(started.requestId);
}
