// @ts-nocheck
import { state } from './state.js';
import { elements } from './dom.js';
import { normalizeBaseUrl } from './utils.js';

const DEFAULT_NANOGPT_BASE_URL = 'https://nano-gpt.com';

function getNanoGptBaseUrl() {
    return normalizeBaseUrl(
        elements.nanogptUrl?.value || state.settings.nanogptUrl || DEFAULT_NANOGPT_BASE_URL
    );
}

function getNanoGptApiKey() {
    return String(elements.nanogptKey?.value || state.settings.nanogptKey || '').trim();
}

async function extractResponseError(response, fallbackMessage) {
    try {
        const contentType = response.headers.get('content-type') || '';
        if (contentType.includes('application/json')) {
            const data = await response.json();
            return data?.error?.message || data?.message || data?.error || fallbackMessage;
        }

        const text = (await response.text()).trim();
        return text || fallbackMessage;
    } catch {
        return fallbackMessage;
    }
}

function parseModels(payload) {
    const models = Array.isArray(payload?.data)
        ? payload.data
        : Array.isArray(payload?.models)
          ? payload.models
          : [];

    return models
        .filter((model) => model?.capabilities?.image_generation !== false)
        .map((model) => {
            if (typeof model === 'string') {
                return { id: model, label: model };
            }
            const id = model?.id || model?.model || model?.name;
            if (!id) return null;
            const label = model?.name && model.name !== id ? `${model.name} (${id})` : id;
            return { id, label };
        })
        .filter(Boolean);
}

function renderNanoGptModels(models, preferredModel) {
    elements.nanogptModel.innerHTML = '<option value="">Select a NanoGPT model...</option>';

    models.forEach((model) => {
        const option = document.createElement('option');
        option.value = model.id;
        option.textContent = model.label;
        elements.nanogptModel.appendChild(option);
    });

    if (preferredModel && models.some((model) => model.id === preferredModel)) {
        elements.nanogptModel.value = preferredModel;
    }
}

function dataUrlFromBase64(value) {
    const raw = String(value || '').trim();
    if (!raw) return null;
    if (raw.startsWith('data:')) return raw;
    return `data:image/png;base64,${raw}`;
}

function extractImageResults(payload) {
    const candidates = Array.isArray(payload?.data)
        ? payload.data
        : Array.isArray(payload?.images)
          ? payload.images
          : Array.isArray(payload?.output)
            ? payload.output
            : [];

    return candidates
        .map((item) => {
            if (typeof item === 'string') {
                return item.startsWith('http') || item.startsWith('data:')
                    ? { url: item }
                    : { url: dataUrlFromBase64(item) };
            }

            const url =
                item?.url ||
                item?.image_url ||
                item?.imageUrl ||
                item?.asset_url ||
                item?.assetUrl ||
                dataUrlFromBase64(item?.b64_json || item?.base64 || item?.image_base64);

            return url ? { url, seed: Number.isFinite(item?.seed) ? item.seed : null } : null;
        })
        .filter((item) => item?.url);
}

function buildNanoGptPayload(options = {}) {
    const width = Number.isFinite(options.width)
        ? Math.trunc(options.width)
        : parseInt(elements.imgWidth.value, 10);
    const height = Number.isFinite(options.height)
        ? Math.trunc(options.height)
        : parseInt(elements.imgHeight.value, 10);
    const batchCount = Number.isFinite(options.batchCount)
        ? Math.max(1, Math.min(4, Math.trunc(options.batchCount)))
        : 1;
    const steps = Number.isFinite(options.steps)
        ? Math.trunc(options.steps)
        : parseInt(elements.steps.value, 10);
    const cfgScale = Number.isFinite(options.cfgScale)
        ? options.cfgScale
        : parseFloat(elements.cfgScale.value);
    const seed =
        options.seedMode && options.seedMode !== 'random' && Number.isFinite(options.baseSeed)
            ? Math.trunc(options.baseSeed)
            : null;

    const payload = {
        model: options.model || elements.nanogptModel.value,
        prompt: options.prompt,
        n: batchCount,
        response_format: 'url'
    };

    if (Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0) {
        payload.size = `${width}x${height}`;
    }

    if (Number.isFinite(steps) && steps > 0) {
        payload.num_inference_steps = steps;
    }

    if (Number.isFinite(cfgScale) && cfgScale > 0) {
        payload.guidance_scale = cfgScale;
    }

    if (seed !== null) {
        payload.seed = seed;
    }

    return payload;
}

export async function fetchNanoGptModels(silent = false) {
    const baseUrl = getNanoGptBaseUrl();
    const preferredModel = state.settings.nanogptModel || elements.nanogptModel.value;

    try {
        elements.fetchNanoGptModelsBtn.disabled = true;
        elements.fetchNanoGptModelsBtn.innerHTML = `
            <div class="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin"></div>
            Fetching...
        `;

        const response = await fetch('/api/nanogpt/images/models', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                baseUrl,
                apiKey: getNanoGptApiKey()
            }),
            cache: 'no-store'
        });

        if (!response.ok) {
            throw new Error(
                await extractResponseError(response, 'Failed to fetch NanoGPT models.')
            );
        }

        const models = parseModels(await response.json());
        renderNanoGptModels(models, preferredModel);

        if (!silent) {
            alert(`Successfully fetched ${models.length} NanoGPT image models.`);
        }
    } catch (error) {
        console.error('Error fetching NanoGPT models:', error);
        if (!silent) {
            alert(error.message || 'Failed to fetch NanoGPT image models.');
        }
    } finally {
        elements.fetchNanoGptModelsBtn.disabled = false;
        elements.fetchNanoGptModelsBtn.innerHTML = `
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path>
            </svg>
            Load Models
        `;
    }
}

export async function generateNanoGptImages(options = {}) {
    const baseUrl = getNanoGptBaseUrl();
    const apiKey = getNanoGptApiKey();
    const payload = buildNanoGptPayload(options);

    if (!apiKey) {
        throw new Error('Please enter your NanoGPT API key first.');
    }

    if (!payload.model) {
        throw new Error('Please select a NanoGPT image model first.');
    }

    try {
        elements.imageIndicator?.classList.remove('hidden');

        const response = await fetch('/api/nanogpt/images', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                baseUrl,
                apiKey,
                payload
            })
        });

        if (!response.ok) {
            throw new Error(
                await extractResponseError(response, 'NanoGPT image generation failed.')
            );
        }

        const images = extractImageResults(await response.json());
        if (images.length === 0) {
            throw new Error('NanoGPT completed the request but returned no images.');
        }

        return images;
    } catch (error) {
        console.error('Error generating NanoGPT image batch:', error);
        throw error instanceof Error ? error : new Error('Failed to generate image with NanoGPT.');
    } finally {
        elements.imageIndicator?.classList.add('hidden');
    }
}

export async function generateNanoGptImage(prompt, width = null, height = null) {
    const images = await generateNanoGptImages({
        prompt,
        width,
        height,
        batchCount: 1
    });
    return images[0]?.url || null;
}
