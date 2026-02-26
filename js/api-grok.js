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
