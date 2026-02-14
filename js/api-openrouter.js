import { elements } from './dom.js';

// Store fetched models for filtering
let fetchedModels = [];

// Filter and populate models based on search query
function filterAndPopulateModels(searchQuery = '') {
    const query = searchQuery.toLowerCase().trim();
    const previousValue = elements.openrouterModel.value;

    // Clear current options
    elements.openrouterModel.innerHTML = '<option value="">Select a model...</option>';

    // Filter models
    const filteredModels = query
        ? fetchedModels.filter(model =>
            model.name.toLowerCase().includes(query) ||
            model.id.toLowerCase().includes(query)
        )
        : fetchedModels;

    // Populate select with filtered models
    filteredModels.forEach(model => {
        const option = document.createElement('option');
        option.value = model.id;
        option.textContent = `${model.name} (${model.id})`;
        elements.openrouterModel.appendChild(option);
    });


    if (previousValue && filteredModels.some(model => model.id === previousValue)) {
        elements.openrouterModel.value = previousValue;
    }

    // Update select label to show filter results
    if (query && filteredModels.length > 0) {
        elements.openrouterModel.options[0].textContent = `Select a model (${filteredModels.length} found)...`;
    } else if (query && filteredModels.length === 0) {
        elements.openrouterModel.options[0].textContent = 'No models match your search';
    } else {
        elements.openrouterModel.options[0].textContent = 'Select a model...';
    }
}

// Setup search input event listener
export function setupModelSearch() {
    elements.openrouterModelSearch.addEventListener('input', (e) => {
        filterAndPopulateModels(e.target.value);
    });
}

// Fetch all available models from OpenRouter
export async function fetchOpenRouterModels(silent = false) {
    if (typeof silent !== 'boolean') silent = false;
    const apiKey = elements.openrouterKey.value;

    if (!apiKey) {
        if (!silent) alert('Please enter your OpenRouter API key first.');
        return;
    }

    try {
        elements.fetchOpenRouterModelsBtn.disabled = true;
        elements.fetchOpenRouterModelsBtn.innerHTML = `
            <div class="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin"></div>
            Fetching...
        `;

        const response = await fetch('https://openrouter.ai/api/v1/models', {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'HTTP-Referer': window.location.href,
                'X-Title': 'EroChat + SwarmUI'
            }
        });

        if (!response.ok) {
            throw new Error('Failed to fetch models. Check your API key.');
        }

        const data = await response.json();
        fetchedModels = data.data || [];

        // Clear search input
        elements.openrouterModelSearch.value = '';
        elements.openrouterModelSearch.disabled = false;
        elements.openrouterModelSearch.placeholder = 'Type to search models...';

        // Populate select with all models
        filterAndPopulateModels();

        if (!silent) alert(`Successfully fetched ${fetchedModels.length} models from OpenRouter!`);

    } catch (error) {
        console.error('Error fetching OpenRouter models:', error);
        if (!silent) alert('Failed to fetch models: ' + error.message);
    } finally {
        elements.fetchOpenRouterModelsBtn.disabled = false;
        elements.fetchOpenRouterModelsBtn.innerHTML = `
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path>
            </svg>
            Load OpenRouter Models
        `;
    }
}

// Send chat completion request to OpenRouter
export async function sendChatRequest(apiMessages) {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${elements.openrouterKey.value}`,
            'HTTP-Referer': window.location.href,
            'X-Title': 'EroChat + SwarmUI'
        },
        body: JSON.stringify({
            model: elements.openrouterModel.value,
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
    return data.choices[0].message.content;
}


// Generate a high-quality system prompt for a character using Claude 4.5 Sonnet via OpenRouter
export async function generateCharacterSystemPrompt({ name, description, background, userInfo }) {
    const generatorModel = 'anthropic/claude-sonnet-4.5';
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${elements.openrouterKey.value}`,
            'HTTP-Referer': window.location.href,
            'X-Title': 'EroChat + SwarmUI'
        },
        body: JSON.stringify({
            model: generatorModel,
            messages: [
                {
                    role: 'system',
                    content: 'You are an expert prompt engineer for immersive character roleplay. Write production-ready system prompts. Return only the final system prompt text without markdown fences or extra commentary.'
                },
                {
                    role: 'user',
                    content: `Create a high-quality, detailed system prompt for an AI roleplay character with the following data.\n\nCharacter name: ${name}\nDescription / personality: ${description}\nBackground / other details: ${background || 'None provided'}\nUser info and description: ${userInfo}\n\nRequirements:\n- Keep the character fully consistent and in-character.\n- Make the writing style vivid and expressive.\n- Include practical behavioral rules, memory priorities, tone guidance, and interaction style with the user profile.\n- Include clear formatting for output quality and scene continuity.\n- At the end, include an image prompt block exactly in this format:\n---IMAGE_PROMPT START---\n[highly detailed Stable Diffusion prompt matching current scene]\n---IMAGE_PROMPT END---\n- Return only the completed system prompt.`
                }
            ],
            temperature: 0.7,
            max_tokens: 2200
        })
    });

    if (!response.ok) {
        let errorMessage = 'Failed to generate system prompt';
        try {
            const error = await response.json();
            errorMessage = error.error?.message || errorMessage;
        } catch {
            // ignore json parsing failures
        }
        throw new Error(errorMessage);
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content?.trim() || '';
}
