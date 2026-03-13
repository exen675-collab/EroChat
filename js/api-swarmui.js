import { state } from './state.js';
import { elements } from './dom.js';
import { updateConnectionStatus, normalizeBaseUrl, normalizeSwarmSampler } from './utils.js';

const SWARM_ALLOWED_ASPECT_RATIOS = [
    '1:1',
    '4:3',
    '3:2',
    '8:5',
    '16:9',
    '21:9',
    '3:4',
    '2:3',
    '5:8',
    '9:16',
    '9:21'
];

function greatestCommonDivisor(a, b) {
    let x = Math.abs(Math.trunc(a));
    let y = Math.abs(Math.trunc(b));

    while (y !== 0) {
        const remainder = x % y;
        x = y;
        y = remainder;
    }

    return x || 1;
}

function resolveSwarmAspectRatio(width, height) {
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
        return '2:3';
    }

    const divisor = greatestCommonDivisor(width, height);
    const normalizedWidth = Math.trunc(width / divisor);
    const normalizedHeight = Math.trunc(height / divisor);
    const normalizedRatio = `${normalizedWidth}:${normalizedHeight}`;

    if (SWARM_ALLOWED_ASPECT_RATIOS.includes(normalizedRatio)) {
        return normalizedRatio;
    }

    return 'Custom';
}

async function extractResponseError(response, fallbackMessage) {
    try {
        const contentType = response.headers.get('content-type') || '';
        if (contentType.includes('application/json')) {
            const data = await response.json();
            return data?.error || data?.message || fallbackMessage;
        }

        const text = (await response.text()).trim();
        return text || fallbackMessage;
    } catch {
        return fallbackMessage;
    }
}

function parseModels(data) {
    let models = [];

    if (data.models && Array.isArray(data.models)) {
        models = data.models.map(model => typeof model === 'string' ? model : (model.name || model.title || JSON.stringify(model)));
    } else if (data.files && Array.isArray(data.files)) {
        models = data.files
            .map(file => typeof file === 'string' ? file : (file.name || file.title || file.path || null))
            .filter(file => file && typeof file === 'string' && (file.endsWith('.safetensors') || file.endsWith('.ckpt') || !file.includes('.')));
    } else if (typeof data === 'object' && data) {
        for (const key of Object.keys(data)) {
            if (!Array.isArray(data[key])) continue;
            const candidates = data[key]
                .map(item => {
                    if (typeof item === 'string') return item;
                    if (typeof item === 'object' && item !== null) {
                        return item.name || item.title || item.path || null;
                    }
                    return null;
                })
                .filter(Boolean);

            if (candidates.length > 0) {
                models = candidates;
                break;
            }
        }
    }

    return models;
}

function renderModels(models, preferredModel) {
    elements.swarmModel.innerHTML = '<option value="">Select a model...</option>';

    models.forEach(model => {
        const option = document.createElement('option');
        option.value = model;
        option.textContent = model;
        elements.swarmModel.appendChild(option);
    });

    if (preferredModel && models.includes(preferredModel)) {
        elements.swarmModel.value = preferredModel;
    }
}

export async function fetchSwarmModels(silent = false) {
    const url = normalizeBaseUrl(elements.swarmUrl.value);
    const preferredModel = state.settings.swarmModel || elements.swarmModel.value;

    try {
        elements.fetchModelsBtn.disabled = true;
        elements.fetchModelsBtn.innerHTML = `
            <div class="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin"></div>
            Fetching...
        `;

        if (!state.sessionId) {
            await getSwarmSession();
        }

        const response = await fetch(`${url}/API/ListModels`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                session_id: state.sessionId,
                path: '',
                depth: 2
            })
        });

        if (!response.ok) {
            await getSwarmSession();
            const retry = await fetch(`${url}/API/ListModels`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    session_id: state.sessionId,
                    path: '',
                    depth: 2
                })
            });

            if (!retry.ok) {
                throw new Error('Failed to fetch models');
            }

            const data = await retry.json();
            renderModels(parseModels(data), preferredModel);
            updateConnectionStatus(true);
            if (!silent) {
                alert(`Successfully fetched ${elements.swarmModel.options.length - 1} models!`);
            }
            return;
        }

        const data = await response.json();
        renderModels(parseModels(data), preferredModel);
        updateConnectionStatus(true);
        if (!silent) {
            alert(`Successfully fetched ${elements.swarmModel.options.length - 1} models!`);
        }
    } catch (error) {
        console.error('Error fetching SwarmUI models:', error);
        updateConnectionStatus(false);
        if (!silent) {
            alert('Failed to fetch models. Make sure SwarmUI is running at the specified URL.');
        }
    } finally {
        elements.fetchModelsBtn.disabled = false;
        elements.fetchModelsBtn.innerHTML = `
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path>
            </svg>
            Load Models
        `;
    }
}

export async function getSwarmSession() {
    const url = normalizeBaseUrl(elements.swarmUrl.value);

    const response = await fetch(`${url}/API/GetNewSession`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
    });

    if (!response.ok) {
        updateConnectionStatus(false);
        throw new Error('Failed to get session');
    }

    const data = await response.json();
    state.sessionId = data.session_id;
    updateConnectionStatus(true);
    return data.session_id;
}

function buildSwarmPayload(options = {}) {
    const batchCount = Number.isFinite(options.batchCount) ? Math.max(1, Math.min(4, Math.trunc(options.batchCount))) : 1;
    const width = Number.isFinite(options.width) ? Math.trunc(options.width) : parseInt(elements.imgWidth.value, 10);
    const height = Number.isFinite(options.height) ? Math.trunc(options.height) : parseInt(elements.imgHeight.value, 10);
    const steps = Number.isFinite(options.steps) ? Math.trunc(options.steps) : parseInt(elements.steps.value, 10);
    const cfgScale = Number.isFinite(options.cfgScale) ? options.cfgScale : parseFloat(elements.cfgScale.value);
    const sampler = normalizeSwarmSampler(options.sampler || elements.sampler.value);
    const seedMode = options.seedMode || 'random';
    const baseSeed = Number.isFinite(options.baseSeed) ? Math.trunc(options.baseSeed) : 1;

    return {
        session_id: state.sessionId,
        images: batchCount,
        batchsize: String(batchCount),
        prompt: options.prompt,
        negativeprompt: typeof options.negativePrompt === 'string'
            ? options.negativePrompt
            : ' (bad quality:1.15), (worst quality:1.3)',
        model: options.model || elements.swarmModel.value,
        width,
        height,
        steps,
        cfgscale: cfgScale,
        sampler_name: sampler,
        scheduler: 'karras',
        seed: seedMode === 'random' ? -1 : baseSeed,
        aspectratio: resolveSwarmAspectRatio(width, height),
        automaticvae: true,
        clipstopatlayer: '-2',
        colorcorrectionbehavior: 'None',
        colordepth: '8bit'
    };
}

export async function generateLocalImages(options = {}) {
    const url = normalizeBaseUrl(elements.swarmUrl.value);
    const payload = buildSwarmPayload(options);

    try {
        elements.imageIndicator.classList.remove('hidden');

        if (!state.sessionId) {
            await getSwarmSession();
            payload.session_id = state.sessionId;
        }

        let response = await fetch(`${url}/API/GenerateText2Image`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            await getSwarmSession();
            payload.session_id = state.sessionId;
            response = await fetch(`${url}/API/GenerateText2Image`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
        }

        if (!response.ok) {
            throw new Error(await extractResponseError(response, 'Failed to generate image after retry'));
        }

        const data = await response.json();
        const images = Array.isArray(data.images) ? data.images : [];
        if (images.length === 0) {
            throw new Error('No images were generated');
        }

        return images.map((imagePath, index) => ({
            url: `${url}/${imagePath}`,
            seed: payload.seed === -1 ? null : payload.seed + (options.seedMode === 'increment' ? index : 0)
        }));
    } catch (error) {
        console.error('Error generating Swarm image batch:', error);
        throw error;
    } finally {
        elements.imageIndicator.classList.add('hidden');
    }
}

export async function generateLocalImage(prompt, width = null, height = null) {
    const images = await generateLocalImages({
        prompt,
        width,
        height,
        batchCount: 1
    });
    return images[0]?.url || null;
}

export const generateImage = generateLocalImage;
