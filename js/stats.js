import { defaultCharacter } from './config.js';
import { elements } from './dom.js';
import { state } from './state.js';

const TRACKED_VIEWS = ['chat', 'generator', 'gallery', 'stats'];
const DAILY_ACTIVITY_KEYS = ['messagesSent', 'assistantReplies', 'imagesGenerated', 'generatorRuns', 'viewSwitches'];
const MAX_PROMPT_ENTRIES = 24;
const ACTIVITY_DAY_COUNT = 7;

function normalizeMap(value) {
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function normalizeIsoDate(value) {
    const date = value ? new Date(value) : new Date();
    if (Number.isNaN(date.getTime())) {
        return new Date().toISOString();
    }
    return date.toISOString();
}

function getDayKey(value) {
    return normalizeIsoDate(value).slice(0, 10);
}

function getStatistics() {
    state.statistics = ensureStatisticsShape(state.statistics);
    return state.statistics;
}

function getDailyBucket(dayKey) {
    const statistics = getStatistics();
    if (!statistics.dailyActivity[dayKey]) {
        statistics.dailyActivity[dayKey] = {
            messagesSent: 0,
            assistantReplies: 0,
            imagesGenerated: 0,
            generatorRuns: 0,
            viewSwitches: 0
        };
    }
    return statistics.dailyActivity[dayKey];
}

function incrementCount(map, label, amount = 1) {
    const normalizedLabel = String(label || '').trim();
    if (!normalizedLabel) return;
    map[normalizedLabel] = (map[normalizedLabel] || 0) + amount;
}

function normalizePromptText(prompt) {
    return String(prompt || '')
        .replace(/\s+/g, ' ')
        .trim();
}

function getPromptKey(prompt) {
    return normalizePromptText(prompt).toLowerCase().slice(0, 180);
}

function getPromptLabel(prompt) {
    const normalized = normalizePromptText(prompt);
    if (!normalized) return '';
    return normalized.length > 96 ? `${normalized.slice(0, 93)}...` : normalized;
}

function touchPromptUsage(prompt, source, createdAt) {
    const key = getPromptKey(prompt);
    if (!key) return;

    const statistics = getStatistics();
    const current = statistics.promptUsage[key] || {
        text: getPromptLabel(prompt),
        count: 0,
        lastUsedAt: null,
        sources: {}
    };

    current.text = getPromptLabel(prompt);
    current.count += 1;
    current.lastUsedAt = normalizeIsoDate(createdAt);
    current.sources = normalizeMap(current.sources);
    current.sources[source] = (current.sources[source] || 0) + 1;

    statistics.promptUsage[key] = current;

    const promptEntries = Object.entries(statistics.promptUsage)
        .sort(([, left], [, right]) => {
            if (right.count !== left.count) return right.count - left.count;
            return Date.parse(right.lastUsedAt || '') - Date.parse(left.lastUsedAt || '');
        })
        .slice(0, MAX_PROMPT_ENTRIES);

    statistics.promptUsage = Object.fromEntries(promptEntries);
}

function finalizeStatisticsUpdate(createdAt = null) {
    const statistics = getStatistics();
    statistics.lastUpdatedAt = normalizeIsoDate(createdAt);
    if (state.currentView === 'stats') {
        renderStatisticsDashboard();
    }
}

function formatProviderLabel(provider, fallback) {
    const normalized = String(provider || '').trim().toLowerCase();
    if (normalized === 'swarm') return 'SwarmUI';
    if (normalized === 'comfy') return 'ComfyUI';
    if (normalized === 'premium') return 'Premium';
    if (normalized === 'openrouter') return 'OpenRouter';
    return String(provider || fallback || 'Unknown');
}

function getTrackedCharacters() {
    const characters = state.characters.length > 0 ? state.characters : [{ ...defaultCharacter }];

    return characters.map((character) => ({
        ...character,
        messages:
            character.id === state.currentCharacterId
                ? [...state.messages]
                : [...(Array.isArray(character.messages) ? character.messages : [])]
    }));
}

function getAllConversationMessages() {
    return getTrackedCharacters().flatMap((character) =>
        (Array.isArray(character.messages) ? character.messages : []).map((message) => ({
            ...message,
            characterId: character.id,
            characterName: character.name || 'Unknown character'
        }))
    );
}

function getTotalsFromState() {
    const messages = getAllConversationMessages();
    return {
        userMessages: messages.filter((message) => message.role === 'user').length,
        assistantReplies: messages.filter((message) => message.role === 'assistant').length,
        chatImages: state.galleryImages.filter((item) => item.imageUrl).length,
        generatorImages: state.generatorAssets.filter((asset) => asset.mediaType === 'image').length,
        generatorRuns: state.generatorJobs.length,
        activeCharacters: getTrackedCharacters().filter((character) => character.id !== 'default').length || 1
    };
}

function getTopCharacters(limit = 5) {
    return getTrackedCharacters()
        .map((character) => {
            const messages = Array.isArray(character.messages) ? character.messages : [];
            const userMessages = messages.filter((message) => message.role === 'user').length;
            const assistantReplies = messages.filter((message) => message.role === 'assistant').length;
            return {
                id: character.id,
                name: character.name || 'Unknown character',
                avatar: character.avatar || '🤖',
                totalMessages: messages.length,
                userMessages,
                assistantReplies
            };
        })
        .filter((character) => character.totalMessages > 0)
        .sort((left, right) => {
            if (right.totalMessages !== left.totalMessages) {
                return right.totalMessages - left.totalMessages;
            }
            return right.assistantReplies - left.assistantReplies;
        })
        .slice(0, limit);
}

function buildFallbackActivityMap() {
    const activity = {};

    getAllConversationMessages().forEach((message) => {
        if (!message.createdAt) return;
        const bucket = activity[getDayKey(message.createdAt)] || {
            messagesSent: 0,
            assistantReplies: 0,
            imagesGenerated: 0,
            generatorRuns: 0,
            viewSwitches: 0
        };
        if (message.role === 'user') bucket.messagesSent += 1;
        if (message.role === 'assistant') bucket.assistantReplies += 1;
        activity[getDayKey(message.createdAt)] = bucket;
    });

    state.galleryImages.forEach((item) => {
        if (!item.createdAt || (!item.imageUrl && !item.videoUrl)) return;
        const dayKey = getDayKey(item.createdAt);
        const bucket = activity[dayKey] || {
            messagesSent: 0,
            assistantReplies: 0,
            imagesGenerated: 0,
            generatorRuns: 0,
            viewSwitches: 0
        };
        bucket.imagesGenerated += 1;
        activity[dayKey] = bucket;
    });

    state.generatorAssets.forEach((asset) => {
        if (!asset.createdAt || asset.mediaType !== 'image') return;
        const dayKey = getDayKey(asset.createdAt);
        const bucket = activity[dayKey] || {
            messagesSent: 0,
            assistantReplies: 0,
            imagesGenerated: 0,
            generatorRuns: 0,
            viewSwitches: 0
        };
        bucket.imagesGenerated += 1;
        activity[dayKey] = bucket;
    });

    return activity;
}

function getActivitySeries(dayCount = ACTIVITY_DAY_COUNT) {
    const statistics = getStatistics();
    const storedActivity = Object.keys(statistics.dailyActivity).length
        ? statistics.dailyActivity
        : buildFallbackActivityMap();
    const today = new Date();
    const days = [];

    for (let index = dayCount - 1; index >= 0; index -= 1) {
        const date = new Date(today);
        date.setDate(today.getDate() - index);
        const dayKey = getDayKey(date);
        days.push({
            dayKey,
            label: date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
            ...{
                messagesSent: 0,
                assistantReplies: 0,
                imagesGenerated: 0,
                generatorRuns: 0,
                viewSwitches: 0,
                ...(storedActivity[dayKey] || {})
            }
        });
    }

    return days;
}

function getTopEntries(map, limit = 5) {
    return Object.entries(normalizeMap(map))
        .map(([label, count]) => ({ label, count }))
        .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label))
        .slice(0, limit);
}

function renderSummaryCards() {
    if (!elements.statsSummary) return;

    const totals = getTotalsFromState();
    const cards = [
        {
            label: 'Messages sent',
            value: totals.userMessages,
            detail: 'User prompts across saved conversations'
        },
        {
            label: 'Assistant replies',
            value: totals.assistantReplies,
            detail: 'Generated responses kept in chat history'
        },
        {
            label: 'Images generated',
            value: totals.chatImages + totals.generatorImages,
            detail: `${totals.chatImages} from chat, ${totals.generatorImages} from generator`
        },
        {
            label: 'Generator runs',
            value: totals.generatorRuns,
            detail: 'Queued and completed generator jobs'
        },
        {
            label: 'Active characters',
            value: totals.activeCharacters,
            detail: 'Characters with saved conversations or the default profile'
        }
    ];

    elements.statsSummary.innerHTML = cards
        .map(
            (card) => `
                <article class="stats-card">
                    <p class="stats-card-label">${card.label}</p>
                    <p class="stats-card-value">${card.value}</p>
                    <p class="stats-card-detail">${card.detail}</p>
                </article>
            `
        )
        .join('');
}

function renderActivityChart() {
    if (!elements.statsActivityChart) return;

    const days = getActivitySeries();
    const peak = Math.max(
        1,
        ...days.map((day) =>
            Math.max(day.messagesSent, day.assistantReplies, day.imagesGenerated, day.generatorRuns)
        )
    );

    elements.statsActivityChart.innerHTML = days
        .map(
            (day) => `
                <article class="stats-day-card">
                    <div class="stats-day-chart">
                        <div class="stats-bar-group">
                            <span class="stats-bar stats-bar-chat" style="height: ${(day.messagesSent / peak) * 100}%"></span>
                            <span class="stats-bar stats-bar-replies" style="height: ${(day.assistantReplies / peak) * 100}%"></span>
                            <span class="stats-bar stats-bar-images" style="height: ${(day.imagesGenerated / peak) * 100}%"></span>
                            <span class="stats-bar stats-bar-generator" style="height: ${(day.generatorRuns / peak) * 100}%"></span>
                        </div>
                    </div>
                    <p class="stats-day-label">${day.label}</p>
                    <p class="stats-day-meta">${day.messagesSent} / ${day.assistantReplies} / ${day.imagesGenerated}</p>
                </article>
            `
        )
        .join('');
}

function renderUsagePanels() {
    if (!elements.statsUsagePanels) return;

    const statistics = getStatistics();
    const sections = [
        {
            title: 'Text models',
            items: getTopEntries(statistics.modelUsage.text)
        },
        {
            title: 'Image tools',
            items: getTopEntries(statistics.modelUsage.image)
        },
        {
            title: 'Generator tools',
            items: getTopEntries(statistics.modelUsage.generator)
        },
        {
            title: 'Workspace views',
            items: getTopEntries(statistics.viewCounts)
        }
    ];

    elements.statsUsagePanels.innerHTML = sections
        .map(
            (section) => `
                <section class="stats-mini-panel">
                    <div class="stats-panel-head">
                        <span>${section.title}</span>
                    </div>
                    ${
                        section.items.length > 0
                            ? `<div class="stats-list">${section.items
                                  .map(
                                      (item) => `
                                        <div class="stats-list-row">
                                            <span>${item.label}</span>
                                            <strong>${item.count}</strong>
                                        </div>
                                    `
                                  )
                                  .join('')}</div>`
                            : '<p class="stats-empty-copy">No tracked usage yet.</p>'
                    }
                </section>
            `
        )
        .join('');
}

function renderCharacters() {
    if (!elements.statsCharacterList) return;

    const characters = getTopCharacters();
    elements.statsCharacterList.innerHTML =
        characters.length > 0
            ? characters
                  .map(
                      (character) => `
                        <article class="stats-character-card">
                            <div class="stats-character-avatar">${character.avatar}</div>
                            <div>
                                <p class="stats-character-name">${character.name}</p>
                                <p class="stats-character-meta">${character.totalMessages} total messages</p>
                            </div>
                            <div class="stats-character-split">
                                <span>${character.userMessages} user</span>
                                <span>${character.assistantReplies} assistant</span>
                            </div>
                        </article>
                    `
                  )
                  .join('')
            : '<p class="stats-empty-copy">Start chatting to see your most active conversations.</p>';
}

function renderPrompts() {
    if (!elements.statsPromptList) return;

    const prompts = Object.values(getStatistics().promptUsage)
        .sort((left, right) => {
            if (right.count !== left.count) return right.count - left.count;
            return Date.parse(right.lastUsedAt || '') - Date.parse(left.lastUsedAt || '');
        })
        .slice(0, 6);

    elements.statsPromptList.innerHTML =
        prompts.length > 0
            ? prompts
                  .map(
                      (prompt) => `
                        <article class="stats-prompt-card">
                            <p class="stats-prompt-text">${prompt.text}</p>
                            <div class="stats-prompt-meta">
                                <span>${prompt.count} uses</span>
                                <span>${Object.entries(prompt.sources)
                                    .map(([source, count]) => `${source}: ${count}`)
                                    .join(' · ')}</span>
                            </div>
                        </article>
                    `
                  )
                  .join('')
            : '<p class="stats-empty-copy">Repeated prompts will appear here once you use chat or generator a few times.</p>';
}

export function ensureStatisticsShape(statistics = state.statistics) {
    const current = statistics && typeof statistics === 'object' ? statistics : {};
    const normalized = {
        dailyActivity: normalizeMap(current.dailyActivity),
        viewCounts: {
            chat: 0,
            generator: 0,
            gallery: 0,
            stats: 0,
            ...normalizeMap(current.viewCounts)
        },
        modelUsage: {
            text: normalizeMap(current.modelUsage?.text),
            image: normalizeMap(current.modelUsage?.image),
            generator: normalizeMap(current.modelUsage?.generator)
        },
        promptUsage: normalizeMap(current.promptUsage),
        lastUpdatedAt: current.lastUpdatedAt || null
    };

    Object.keys(normalized.dailyActivity).forEach((dayKey) => {
        const bucket = normalizeMap(normalized.dailyActivity[dayKey]);
        normalized.dailyActivity[dayKey] = DAILY_ACTIVITY_KEYS.reduce((result, key) => {
            result[key] = Number.isFinite(bucket[key]) ? bucket[key] : 0;
            return result;
        }, {});
    });

    TRACKED_VIEWS.forEach((view) => {
        normalized.viewCounts[view] = Number.isFinite(normalized.viewCounts[view])
            ? normalized.viewCounts[view]
            : 0;
    });

    Object.keys(normalized.promptUsage).forEach((key) => {
        const prompt = normalized.promptUsage[key];
        normalized.promptUsage[key] = {
            text: getPromptLabel(prompt?.text || key),
            count: Number.isFinite(prompt?.count) ? prompt.count : 0,
            lastUsedAt: prompt?.lastUsedAt || null,
            sources: normalizeMap(prompt?.sources)
        };
    });

    return normalized;
}

export function trackViewVisit(view, createdAt = null) {
    const nextView = TRACKED_VIEWS.includes(view) ? view : 'chat';
    const statistics = getStatistics();
    incrementCount(statistics.viewCounts, nextView, 1);
    getDailyBucket(getDayKey(createdAt)).viewSwitches += 1;
    finalizeStatisticsUpdate(createdAt);
}

export function recordUserMessage({ content = '', createdAt = null } = {}) {
    getDailyBucket(getDayKey(createdAt)).messagesSent += 1;
    touchPromptUsage(content, 'chat', createdAt);
    finalizeStatisticsUpdate(createdAt);
}

export function recordAssistantReply({ textProvider = '', model = '', createdAt = null } = {}) {
    const statistics = getStatistics();
    const label =
        textProvider === 'premium'
            ? 'Premium'
            : model
              ? `${formatProviderLabel(textProvider, 'OpenRouter')} · ${model}`
              : formatProviderLabel(textProvider, 'OpenRouter');

    getDailyBucket(getDayKey(createdAt)).assistantReplies += 1;
    incrementCount(statistics.modelUsage.text, label, 1);
    finalizeStatisticsUpdate(createdAt);
}

export function recordGeneratedMedia({
    provider = '',
    prompt = '',
    source = 'chat',
    createdAt = null,
    amount = 1
} = {}) {
    const statistics = getStatistics();
    const labelPrefix = source === 'generator' ? 'Generator' : 'Chat image';

    getDailyBucket(getDayKey(createdAt)).imagesGenerated += amount;
    incrementCount(
        statistics.modelUsage.image,
        `${labelPrefix} · ${formatProviderLabel(provider, 'Image tool')}`,
        amount
    );

    if (prompt) {
        touchPromptUsage(prompt, source === 'generator' ? 'generator' : 'image', createdAt);
    }

    finalizeStatisticsUpdate(createdAt);
}

export function recordGeneratorBatch({
    provider = '',
    prompt = '',
    batchCount = 1,
    createdAt = null
} = {}) {
    const statistics = getStatistics();
    const safeBatchCount = Math.max(1, Number.parseInt(batchCount, 10) || 1);

    getDailyBucket(getDayKey(createdAt)).generatorRuns += safeBatchCount;
    incrementCount(
        statistics.modelUsage.generator,
        formatProviderLabel(provider, 'Generator'),
        safeBatchCount
    );
    touchPromptUsage(prompt, 'generator', createdAt);
    finalizeStatisticsUpdate(createdAt);
}

export function renderStatisticsDashboard() {
    if (!elements.statsSummary) return;

    renderSummaryCards();
    renderActivityChart();
    renderUsagePanels();
    renderCharacters();
    renderPrompts();

    if (elements.statsTrackingNote) {
        const statistics = getStatistics();
        elements.statsTrackingNote.textContent = Object.keys(statistics.dailyActivity).length > 0
            ? 'Totals include saved history. Trend charts get more accurate as new activity is recorded.'
            : 'This dashboard starts learning from new activity. Historical totals are still shown where they can be derived.';
    }
}