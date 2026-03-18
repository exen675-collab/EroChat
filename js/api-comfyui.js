import { state } from './state.js';
import { elements } from './dom.js';
import { updateConnectionStatus, normalizeBaseUrl, normalizeSwarmSampler } from './utils.js';

const DEFAULT_NEGATIVE_PROMPT = ' (bad quality:1.15), (worst quality:1.3)';
const COMFY_POLL_INTERVAL_MS = 1000;
const COMFY_TIMEOUT_MS = 180000;

let comfyClientId = null;

function createComfyClientId() {
    if (typeof crypto !== 'undefined') {
        if (typeof crypto.randomUUID === 'function') {
            return crypto.randomUUID();
        }

        if (typeof crypto.getRandomValues === 'function') {
            const bytes = crypto.getRandomValues(new Uint8Array(16));
            return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
        }
    }

    return `erochat_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function getComfyClientId() {
    if (!comfyClientId) {
        comfyClientId = createComfyClientId();
    }
    return comfyClientId;
}

function clampBatchCount(value) {
    return Number.isFinite(value) ? Math.max(1, Math.min(4, Math.trunc(value))) : 1;
}

function normalizePositiveInteger(value, fallback) {
    const parsed = Number.isFinite(value) ? value : Number.parseInt(value, 10);
    return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : fallback;
}

function normalizePositiveFloat(value, fallback) {
    const parsed = Number.isFinite(value) ? value : Number.parseFloat(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function getRandomSeed() {
    if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
        const words = crypto.getRandomValues(new Uint32Array(2));
        return (words[0] * 0x100000 + (words[1] & 0xfffff)) >>> 0;
    }

    return Math.floor(Math.random() * 0xffffffff);
}

function resolveSeed(seedMode, baseSeed, index = 0) {
    if (seedMode === 'increment') {
        return Math.max(1, normalizePositiveInteger(baseSeed, 1) + index);
    }

    if (seedMode === 'fixed') {
        return Math.max(1, normalizePositiveInteger(baseSeed, 1));
    }

    return Math.max(1, getRandomSeed());
}

function parseModels(data) {
    if (Array.isArray(data)) {
        return data
            .map((item) => {
                if (typeof item === 'string') return item;
                if (item && typeof item === 'object') {
                    return item.name || item.title || item.ckpt_name || item.filename || null;
                }
                return null;
            })
            .filter(Boolean);
    }

    if (data && typeof data === 'object') {
        if (Array.isArray(data.models)) {
            return parseModels(data.models);
        }

        if (Array.isArray(data.files)) {
            return parseModels(data.files);
        }

        for (const value of Object.values(data)) {
            if (Array.isArray(value)) {
                const models = parseModels(value);
                if (models.length > 0) {
                    return models;
                }
            }
        }
    }

    return [];
}

function renderModels(models, preferredModel) {
    elements.comfyModel.innerHTML = '<option value="">Select a checkpoint...</option>';

    models.forEach((model) => {
        const option = document.createElement('option');
        option.value = model;
        option.textContent = model;
        elements.comfyModel.appendChild(option);
    });

    if (preferredModel && models.includes(preferredModel)) {
        elements.comfyModel.value = preferredModel;
    }
}

async function parseJson(response) {
    return response.json().catch(() => ({}));
}

async function extractResponseError(response, fallbackMessage) {
    try {
        const contentType = response.headers.get('content-type') || '';
        if (contentType.includes('application/json')) {
            const data = await response.json();
            return data?.error?.message || data?.error || data?.message || fallbackMessage;
        }

        const text = (await response.text()).trim();
        return text || fallbackMessage;
    } catch {
        return fallbackMessage;
    }
}

function formatNodeErrors(nodeErrors) {
    if (!nodeErrors || typeof nodeErrors !== 'object') {
        return '';
    }

    for (const value of Object.values(nodeErrors)) {
        if (!value) continue;
        if (typeof value === 'string' && value.trim()) {
            return value.trim();
        }
        if (Array.isArray(value)) {
            const item = value.find((entry) => typeof entry === 'string' && entry.trim());
            if (item) return item.trim();
        }
        if (typeof value === 'object') {
            const message =
                value.message || value.error || value.details || value.exception_message || null;
            if (typeof message === 'string' && message.trim()) {
                return message.trim();
            }
        }
    }

    try {
        return JSON.stringify(nodeErrors);
    } catch {
        return 'ComfyUI rejected the workflow.';
    }
}

function formatComfyNetworkError(action, baseUrl, error) {
    if (error instanceof TypeError) {
        return new Error(
            `Failed to ${action}. Make sure ComfyUI is running at ${baseUrl} and CORS is enabled for this app origin.`
        );
    }

    if (error instanceof Error) {
        return error;
    }

    return new Error(`Failed to ${action}.`);
}

function buildComfyWorkflow(options = {}) {
    const width = normalizePositiveInteger(
        options.width,
        parseInt(elements.imgWidth.value, 10) || 832
    );
    const height = normalizePositiveInteger(
        options.height,
        parseInt(elements.imgHeight.value, 10) || 1216
    );
    const steps = normalizePositiveInteger(options.steps, parseInt(elements.steps.value, 10) || 25);
    const cfgScale = normalizePositiveFloat(
        options.cfgScale,
        parseFloat(elements.cfgScale.value) || 7
    );
    const sampler = normalizeSwarmSampler(options.sampler || elements.sampler.value);
    const negativePrompt =
        typeof options.negativePrompt === 'string' && options.negativePrompt.trim()
            ? options.negativePrompt
            : DEFAULT_NEGATIVE_PROMPT;
    const seed = Math.max(1, normalizePositiveInteger(options.seed, 1));
    const model = options.model || elements.comfyModel.value;

    return {
        1: {
            class_type: 'CheckpointLoaderSimple',
            inputs: {
                ckpt_name: model
            }
        },
        2: {
            class_type: 'CLIPTextEncode',
            inputs: {
                text: options.prompt,
                clip: ['1', 1]
            }
        },
        3: {
            class_type: 'CLIPTextEncode',
            inputs: {
                text: negativePrompt,
                clip: ['1', 1]
            }
        },
        4: {
            class_type: 'EmptyLatentImage',
            inputs: {
                width,
                height,
                batch_size: 1
            }
        },
        5: {
            class_type: 'KSampler',
            inputs: {
                seed,
                steps,
                cfg: cfgScale,
                sampler_name: sampler,
                scheduler: 'karras',
                denoise: 1,
                model: ['1', 0],
                positive: ['2', 0],
                negative: ['3', 0],
                latent_image: ['4', 0]
            }
        },
        6: {
            class_type: 'VAEDecode',
            inputs: {
                samples: ['5', 0],
                vae: ['1', 2]
            }
        },
        7: {
            class_type: 'SaveImage',
            inputs: {
                filename_prefix: 'EroChat',
                images: ['6', 0]
            }
        }
    };
}

function buildViewUrl(baseUrl, image) {
    const params = new URLSearchParams({
        filename: image.filename || '',
        subfolder: image.subfolder || '',
        type: image.type || 'output'
    });
    return `${baseUrl}/view?${params.toString()}`;
}

function extractImagesFromHistoryEntry(historyEntry) {
    if (!historyEntry || typeof historyEntry !== 'object') {
        return [];
    }

    const outputs = historyEntry.outputs;
    if (!outputs || typeof outputs !== 'object') {
        return [];
    }

    const images = [];
    for (const nodeOutput of Object.values(outputs)) {
        if (!nodeOutput || typeof nodeOutput !== 'object' || !Array.isArray(nodeOutput.images)) {
            continue;
        }

        nodeOutput.images.forEach((image) => {
            if (image?.filename) {
                images.push(image);
            }
        });
    }

    return images;
}

function extractHistoryStatusMessage(historyEntry) {
    const messages = Array.isArray(historyEntry?.status?.messages)
        ? historyEntry.status.messages
        : [];

    for (const entry of messages) {
        if (!Array.isArray(entry) || typeof entry[1] !== 'object' || entry[1] == null) {
            continue;
        }

        const payload = entry[1];
        const message = payload.exception_message || payload.message || payload.error || null;
        if (typeof message === 'string' && message.trim()) {
            return message.trim();
        }
    }

    return 'ComfyUI reported an execution error.';
}

async function queuePrompt(baseUrl, workflow) {
    let response;
    try {
        response = await fetch(`${baseUrl}/prompt`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                client_id: getComfyClientId(),
                prompt: workflow
            })
        });
    } catch (error) {
        throw formatComfyNetworkError('queue the prompt', baseUrl, error);
    }

    if (!response.ok) {
        throw new Error(await extractResponseError(response, 'ComfyUI rejected the prompt.'));
    }

    const data = await parseJson(response);
    if (data?.node_errors && Object.keys(data.node_errors).length > 0) {
        throw new Error(formatNodeErrors(data.node_errors) || 'ComfyUI rejected the workflow.');
    }

    const promptId = data?.prompt_id || data?.promptId || null;
    if (!promptId) {
        throw new Error('ComfyUI did not return a prompt ID.');
    }

    return promptId;
}

async function waitForPromptImages(baseUrl, promptId) {
    const startedAt = Date.now();
    let lastStatus = 'queued';

    while (Date.now() - startedAt < COMFY_TIMEOUT_MS) {
        await new Promise((resolve) => setTimeout(resolve, COMFY_POLL_INTERVAL_MS));

        let response;
        try {
            response = await fetch(`${baseUrl}/history/${encodeURIComponent(promptId)}`, {
                method: 'GET',
                cache: 'no-store'
            });
        } catch (error) {
            throw formatComfyNetworkError('check ComfyUI job status', baseUrl, error);
        }

        if (!response.ok) {
            throw new Error(
                await extractResponseError(response, 'Failed to fetch ComfyUI job history.')
            );
        }

        const data = await parseJson(response);
        const historyEntry =
            data?.[promptId] || data?.[String(promptId)] || (data?.outputs ? data : null);
        if (!historyEntry) {
            continue;
        }

        const status =
            historyEntry?.status?.status_str || historyEntry?.status?.status || lastStatus;
        if (status) {
            lastStatus = status;
        }

        const images = extractImagesFromHistoryEntry(historyEntry);
        if (images.length > 0) {
            return images;
        }

        if (String(status).toLowerCase() === 'error') {
            throw new Error(extractHistoryStatusMessage(historyEntry));
        }

        if (historyEntry?.outputs && images.length === 0) {
            throw new Error('ComfyUI completed the job but did not return any images.');
        }
    }

    throw new Error('Timed out while waiting for ComfyUI to finish generating images.');
}

export async function fetchComfyModels(silent = false) {
    const baseUrl = normalizeBaseUrl(elements.comfyUrl.value);
    const preferredModel = state.settings.comfyModel || elements.comfyModel.value;

    try {
        elements.fetchComfyModelsBtn.disabled = true;
        elements.fetchComfyModelsBtn.innerHTML = `
            <div class="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin"></div>
            Fetching...
        `;

        let response;
        try {
            response = await fetch(`${baseUrl}/models/checkpoints`, {
                method: 'GET',
                cache: 'no-store'
            });
        } catch (error) {
            throw formatComfyNetworkError('fetch ComfyUI checkpoints', baseUrl, error);
        }

        if (!response.ok) {
            throw new Error(
                await extractResponseError(response, 'Failed to fetch ComfyUI checkpoints.')
            );
        }

        const data = await parseJson(response);
        const models = parseModels(data);
        if (models.length === 0) {
            throw new Error(
                'ComfyUI returned no checkpoints. Load at least one checkpoint and try again.'
            );
        }

        renderModels(models, preferredModel);
        updateConnectionStatus(true);
        if (!silent) {
            alert(`Successfully fetched ${models.length} ComfyUI checkpoints.`);
        }
    } catch (error) {
        console.error('Error fetching ComfyUI models:', error);
        updateConnectionStatus(false);
        if (!silent) {
            alert(error.message || 'Failed to fetch ComfyUI checkpoints.');
        }
    } finally {
        elements.fetchComfyModelsBtn.disabled = false;
        elements.fetchComfyModelsBtn.innerHTML = `
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path>
            </svg>
            Load Checkpoints
        `;
    }
}

export async function generateComfyImages(options = {}) {
    const baseUrl = normalizeBaseUrl(elements.comfyUrl.value);
    const model = options.model || elements.comfyModel.value;

    if (!model) {
        throw new Error('Please select a ComfyUI checkpoint first.');
    }

    const batchCount = clampBatchCount(options.batchCount);
    const seedMode = options.seedMode || 'random';
    const baseSeed = normalizePositiveInteger(options.baseSeed, 1);
    const results = [];

    try {
        elements.imageIndicator.classList.remove('hidden');

        for (let index = 0; index < batchCount; index += 1) {
            const seed = resolveSeed(seedMode, baseSeed, index);
            const workflow = buildComfyWorkflow({
                ...options,
                model,
                seed
            });

            const promptId = await queuePrompt(baseUrl, workflow);
            const images = await waitForPromptImages(baseUrl, promptId);
            const firstImage = images[0];

            if (!firstImage) {
                throw new Error('ComfyUI completed the job but returned no viewable image.');
            }

            results.push({
                url: buildViewUrl(baseUrl, firstImage),
                seed
            });
        }

        return results;
    } catch (error) {
        console.error('Error generating ComfyUI image batch:', error);
        throw error instanceof Error ? error : new Error('Failed to generate image with ComfyUI.');
    } finally {
        elements.imageIndicator.classList.add('hidden');
    }
}

export async function generateComfyImage(prompt, width = null, height = null) {
    const images = await generateComfyImages({
        prompt,
        width,
        height,
        batchCount: 1
    });
    return images[0]?.url || null;
}

export const generateImage = generateComfyImage;
