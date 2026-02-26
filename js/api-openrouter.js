import { elements } from './dom.js';
import { state } from './state.js';
import { sendGrokChatRequest } from './api-grok.js';

// Store fetched models for filtering
let fetchedModels = [];

// Filter and populate models based on search query
function filterAndPopulateModels(searchQuery = '', preferredModelId = null) {
    const query = searchQuery.toLowerCase().trim();
    const previousValue = preferredModelId || elements.openrouterModel.value || state.settings.openrouterModel;

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

export async function sendOpenRouterChatRequest(apiMessages) {
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

// Send chat completion request to selected provider
export async function sendChatRequest(apiMessages) {
    const textProvider = elements.textProvider.value || state.settings.textProvider || 'premium';
    if (textProvider === 'premium') {
        return sendGrokChatRequest(apiMessages);
    }
    return sendOpenRouterChatRequest(apiMessages);
}


// Generate a high-quality system prompt for a character using Claude 4.5 Sonnet via OpenRouter
async function generateCharacterSystemPromptOpenRouter({ name, description, background, userInfo }) {
    const generatorModel = 'anthropic/claude-sonnet-4.5';
    var ROLEPLAY_TEMPLATE = `
    # SYSTEM PROMPT – Roleplay Agent
    ## Gatunek i Typ
    Erotyczny slowburn roleplay . Napięcie buduje się bardzo powoli – przez flirt, dwuznaczności, przypadkowe dotyki, droczenie i prowokacje.


    ## Perspektywa i Styl Odpowiedzi
    - Piszesz WYŁĄCZNIE jako {{agent_name}} (dialog + jej działania + mowa ciała).
    - Nigdy nie piszesz działań, myśli ani słów {{player_name}} – to postać gracza.
    - Format: *akcje i opisy kursywą*, "dialogi normalnie".
    - Długość odpowiedzi: 2–5 akapitów (wystarczająco, żeby budować napięcie, ale nie przytłaczać).

    ## Postać Gracza – {{player_name}}
    - 20 lat, prawiczek, nieatrakcyjny (pryszcze, przeciętna budowa)
    - Bardzo nieśmiały, lekko w spektrum autyzmu – unika kontaktu wzrokowego, niezręczne zachowanie
    - Pełen kompleksów wyglądu, zdesperowany seksualnie, ale sparaliżowany wstydem

    ## Postać Agenta – {{agent_name}} (koleżanka starszej siostry {{player_name}})
    **Wygląd:**
    25-letnia bardzo atrakcyjna kobieta. Długie falowane ciemnobrązowe włosy do ramion. Szczupła, zgrabna sylwetka, ładne małe piersi, bardzo wąska talia. Zawsze ubrana w elegancką, błyszczącą satynową sukienkę w kolorze teal z głębokim drapowanym dekoltem cowl-neck, która pięknie podkreśla figurę.

    **Osobowość:**
    Ekstrawertyczka, pewna siebie, ciepła i opiekuńcza. Jest najlepszą przyjaciółką starszej siostry {{player_name}} i bardzo często bywa u nich w domu (nawet gdy siostra jest w pracy lub na zajęciach). Traktuje Adama troskliwie jak „swojego młodszego braciszka”, ale mocno ją kręci jego nieśmiałość, niezręczność i kompleksy. Uwielbia się nim zajmować, droczyć się z nim, prowokować go, powoli uwodzić i obserwować, jak się czerwieni. Ma wyraźną, silną skłonność do exhibicionizmu – lubi „przypadkowo” pokazywać ciało (głęboki dekolt, pochylanie się, poprawianie sukienki, rozciąganie się itd.).

    ## Zasady Slowburna
    1. Faza 1 – Troskliwa starsza koleżanka + lekkie droczenie
    2. Faza 2 – „Przypadkowe” prowokacje (pochylanie się w dekolcie, dotyk ramienia/uda, sukienka się zsuwa)
    3. Faza 3 – Otwarty flirt i jawne testowanie granic
    4. Faza 4 – Fizyczna eskalacja
    → Przechodź do kolejnej fazy tylko gdy gracz aktywnie eskaluje.

    ## Generowanie Tagów Graficznych (Stable Diffusion / Danbooru)
    Po KAŻDEJ odpowiedzi dodaj na samym dole blok:

    ---IMAGE_PROMPT START---
    masterpiece, best_quality, ...
    ---IMAGE_PROMPT END---
    `
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
                    content: 'Jesteś edytorem promptów. Otrzymujesz TEMPLATE z placeholderami {{PLACEHOLDER}} oraz DANE POSTACI. Wypełnij wszystkie placeholdery odpowiednimi danymi. Zachowaj oryginalną strukturę i formatowanie. Zwróć TYLKO wypełniony prompt, bez żadnych komentarzy. Prompt będzie słózył do erotycznego roleplay. Masz odrobine dowolnosci do edycji ogrinalnego promptu tak zeby pasował pod dane które zostaną ci wysłane.'
                },
                {
                    role: 'user',
                    content: `TEMPLATE:${ROLEPLAY_TEMPLATE}---DANE POSTACI:- Imię agenta: ${name}- Opis: ${description}  - Tło fabularne: ${background}- Dane gracza: ${JSON.stringify(userInfo)}Wypełnij template powyższymi danymi.`
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

async function generateCharacterSystemPromptGrok({ name, description, background, userInfo }) {
    const ROLEPLAY_TEMPLATE = `
    # SYSTEM PROMPT - Roleplay Agent
    ## Genre and Type
    Erotic slowburn roleplay. Tension builds gradually through flirtation, teasing, accidental touches, and provocative subtext.

    ## Perspective and Response Style
    - Write only as {{agent_name}} (dialogue + actions + body language).
    - Never write {{player_name}} thoughts/actions/dialogue.
    - Format: *actions in italics*, "dialogue normal".
    - Response length: 2-5 paragraphs.

    ## Character details
    Fill all placeholders from user-provided details.

    ## Image Prompt Block
    After every response append:
    ---IMAGE_PROMPT START---
    masterpiece, best_quality, ...
    ---IMAGE_PROMPT END---
    `;

    const content = await sendGrokChatRequest(
        [
            {
                role: 'system',
                content: 'You are a prompt editor. Fill all placeholders in the template with provided character data and return only the final system prompt.'
            },
            {
                role: 'user',
                content: `TEMPLATE:${ROLEPLAY_TEMPLATE}---CHARACTER DATA:- Agent name: ${name}- Description: ${description}- Background: ${background}- Player data: ${JSON.stringify(userInfo)}Fill the template with the data above.`
            }
        ],
        {
            temperature: 0.7,
            maxTokens: 2200
        }
    );

    return content.trim();
}

export async function generateCharacterSystemPrompt(payload) {
    const textProvider = elements.textProvider.value || state.settings.textProvider || 'premium';
    if (textProvider === 'premium') {
        return generateCharacterSystemPromptGrok(payload);
    }
    return generateCharacterSystemPromptOpenRouter(payload);
}
