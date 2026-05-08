// @ts-nocheck
import { elements } from './dom.js';
import { state } from './state.js';
import { CHAT_REQUEST_DEFAULTS, OPENROUTER_REASONING_EFFORTS } from './chat-request.js';
import { getOpenRouterQuickAccessModels } from './stats.js';
import {
    buildSystemPromptWithStaticBlocks,
    CHARACTER_SYSTEM_PROMPT_GENERATION_TEMPLATE,
    CHARACTER_SYSTEM_PROMPT_GENERATOR_INSTRUCTIONS,
    stripProtectedSystemPromptBlocks
} from './static-prompts.js';

// Store fetched models for filtering
let fetchedModels = [];

function getFetchedModelLabel(modelId) {
    const model = fetchedModels.find((item) => item.id === modelId);
    return model ? `${model.name} (${model.id})` : modelId;
}

function ensureModelOption(select, modelId) {
    if (
        !select ||
        !modelId ||
        Array.from(select.options).some((option) => option.value === modelId)
    ) {
        return;
    }

    const option = document.createElement('option');
    option.value = modelId;
    option.textContent = getFetchedModelLabel(modelId);
    select.appendChild(option);
}

export function renderOpenRouterQuickModelSelect() {
    if (!elements.openrouterQuickModel) return;

    const models = getOpenRouterQuickAccessModels();
    const currentModel = elements.openrouterModel.value || state.settings.openrouterModel || '';

    elements.openrouterQuickModel.innerHTML =
        '<option value="">Quick access: most used + recent...</option>';
    models.forEach((model) => {
        const option = document.createElement('option');
        option.value = model;
        option.textContent = getFetchedModelLabel(model);
        elements.openrouterQuickModel.appendChild(option);
    });

    elements.openrouterQuickModel.disabled = models.length === 0;
    elements.openrouterQuickModel.value = models.includes(currentModel) ? currentModel : '';
}

export function selectOpenRouterModel(modelId) {
    const normalized = String(modelId || '').trim();
    if (!normalized) return;

    ensureModelOption(elements.openrouterModel, normalized);
    elements.openrouterModel.value = normalized;
    state.settings.openrouterModel = normalized;

    if (elements.openrouterQuickModel) {
        ensureModelOption(elements.openrouterQuickModel, normalized);
        elements.openrouterQuickModel.value = normalized;
    }

    elements.openrouterModel.dispatchEvent(new Event('change'));
}

// Filter and populate models based on search query
function filterAndPopulateModels(searchQuery = '', preferredModelId = null) {
    const query = searchQuery.toLowerCase().trim();
    const previousValue =
        preferredModelId || elements.openrouterModel.value || state.settings.openrouterModel;

    // Clear current options
    elements.openrouterModel.innerHTML = '<option value="">Select a model...</option>';

    // Filter models
    const filteredModels = query
        ? fetchedModels.filter(
              (model) =>
                  model.name.toLowerCase().includes(query) || model.id.toLowerCase().includes(query)
          )
        : fetchedModels;

    // Populate select with filtered models
    filteredModels.forEach((model) => {
        const option = document.createElement('option');
        option.value = model.id;
        option.textContent = `${model.name} (${model.id})`;
        elements.openrouterModel.appendChild(option);
    });

    if (previousValue && filteredModels.some((model) => model.id === previousValue)) {
        elements.openrouterModel.value = previousValue;
    } else if (previousValue) {
        ensureModelOption(elements.openrouterModel, previousValue);
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

    renderOpenRouterQuickModelSelect();
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
                Authorization: `Bearer ${apiKey}`,
                'HTTP-Referer': window.location.href,
                'X-Title': 'EroChat'
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
        filterAndPopulateModels('', state.settings.openrouterModel);

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

function ensureStaticSystemPromptBlock(messages) {
    if (!Array.isArray(messages)) return messages;

    return messages.map((message, index) =>
        index === 0 && message?.role === 'system'
            ? {
                  ...message,
                  content: buildSystemPromptWithStaticBlocks(message.content)
              }
            : message
    );
}

export async function sendOpenRouterChatRequest(apiMessages) {
    const normalizedApiMessages =
        apiMessages &&
        typeof apiMessages === 'object' &&
        !Array.isArray(apiMessages) &&
        Array.isArray(apiMessages.body?.messages)
            ? {
                  ...apiMessages,
                  body: {
                      ...apiMessages.body,
                      messages: ensureStaticSystemPromptBlock(apiMessages.body.messages)
                  }
              }
            : apiMessages;

    const request =
        normalizedApiMessages &&
        typeof normalizedApiMessages === 'object' &&
        !Array.isArray(normalizedApiMessages) &&
        Array.isArray(normalizedApiMessages.body?.messages)
            ? normalizedApiMessages
            : {
                  url: 'https://openrouter.ai/api/v1/chat/completions',
                  headers: {
                      'Content-Type': 'application/json',
                      Authorization: `Bearer ${elements.openrouterKey.value}`,
                      'HTTP-Referer': window.location.href,
                      'X-Title': 'EroChat'
                  },
                  body: {
                      model: elements.openrouterModel.value,
                      messages: ensureStaticSystemPromptBlock(apiMessages),
                      temperature: 0.9,
                      max_tokens: 2000,
                      ...(elements.openrouterReasoningEnabled?.checked
                          ? {
                                reasoning: {
                                    effort: OPENROUTER_REASONING_EFFORTS.includes(
                                        elements.openrouterReasoningEffort?.value
                                    )
                                        ? elements.openrouterReasoningEffort.value
                                        : CHAT_REQUEST_DEFAULTS.reasoningEffort,
                                    exclude: true
                                }
                            }
                          : {})
                  }
              };

    const response = await fetch(request.url, {
        method: 'POST',
        headers: request.headers,
        body: JSON.stringify(request.body)
    });

    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error?.message || 'Failed to get response');
    }

    const data = await response.json();
    return data.choices[0].message.content;
}

// Send chat completion request to selected provider
export async function sendChatRequest(apiMessages) {
    return sendOpenRouterChatRequest(apiMessages);
}

// Generate a high-quality system prompt for a character using Claude 4.5 Sonnet via OpenRouter
async function generateCharacterSystemPromptOpenRouter({
    name,
    description,
    background,
    userInfo
}) {
    const generatorModel = 'anthropic/claude-sonnet-4.5';
    const roleplayTemplate = CHARACTER_SYSTEM_PROMPT_GENERATION_TEMPLATE;
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${elements.openrouterKey.value}`,
            'HTTP-Referer': window.location.href,
            'X-Title': 'EroChat'
        },

        body: JSON.stringify({
            model: generatorModel,
            messages: [
                {
                    role: 'system',
                    content: CHARACTER_SYSTEM_PROMPT_GENERATOR_INSTRUCTIONS
                },
                {
                    role: 'user',
                    content: `TEMPLATE:${roleplayTemplate}---DANE POSTACI:- Imie agenta: ${name}- Opis: ${description} - Tlo fabularne: ${background}- Dane gracza: ${JSON.stringify(userInfo)}Wypelnij template powyzszymi danymi.`
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
    return stripProtectedSystemPromptBlocks(data.choices?.[0]?.message?.content?.trim() || '');
}

export async function generateCharacterSystemPrompt(payload) {
    return generateCharacterSystemPromptOpenRouter(payload);
}
