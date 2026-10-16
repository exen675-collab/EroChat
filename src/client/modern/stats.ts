export interface ActivityPoint {
    date: string;
    label: string;
    messages: number;
    media: number;
    total: number;
}

export interface RankedStat {
    key: string;
    label: string;
    detail: string;
    count: number;
}

export interface StatsInsights {
    activity: ActivityPoint[];
    activeDays: number;
    currentStreak: number;
    busiestDay: ActivityPoint | null;
    topModels: RankedStat[];
    topPrompts: RankedStat[];
    topViews: RankedStat[];
    lastUpdatedAt: string | null;
}

const VIEW_LABELS: Record<string, string> = {
    chat: 'Chat',
    characters: 'Characters',
    browse: 'Browse',
    generator: 'Create',
    gallery: 'Gallery',
    stats: 'Insights'
};

const MODEL_LABELS: Record<string, string> = {
    text: 'Text',
    image: 'Chat image',
    generator: 'Generator'
};

function asRecord(value: unknown): Record<string, any> {
    return value && typeof value === 'object' && !Array.isArray(value)
        ? (value as Record<string, any>)
        : {};
}

function count(value: unknown): number {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function utcDateKey(date: Date): string {
    return date.toISOString().slice(0, 10);
}

function activityForDate(date: string, dailyActivity: Record<string, any>): ActivityPoint {
    const value = asRecord(dailyActivity[date]);
    const messages = count(value.messagesSent) + count(value.assistantReplies);
    const media = count(value.imagesGenerated) + count(value.generatorRuns);
    const parsedDate = new Date(`${date}T00:00:00.000Z`);
    return {
        date,
        label: Number.isNaN(parsedDate.getTime())
            ? date
            : parsedDate.toLocaleDateString(undefined, {
                  month: 'short',
                  day: 'numeric',
                  timeZone: 'UTC'
              }),
        messages,
        media,
        total: messages + media
    };
}

export function buildStatsInsights(
    statistics: Record<string, any> | null | undefined,
    now = new Date()
): StatsInsights {
    const stats = asRecord(statistics);
    const dailyActivity = asRecord(stats.dailyActivity);
    const activity = Array.from({ length: 14 }, (_, index) => {
        const date = new Date(now);
        date.setUTCHours(0, 0, 0, 0);
        date.setUTCDate(date.getUTCDate() - (13 - index));
        return activityForDate(utcDateKey(date), dailyActivity);
    });

    const allActivity = Object.keys(dailyActivity)
        .sort()
        .map((date) => activityForDate(date, dailyActivity));
    const activeDays = allActivity.filter((day) => day.total > 0).length;
    const busiestDay = allActivity.reduce<ActivityPoint | null>(
        (best, day) => (day.total > (best?.total || 0) ? day : best),
        null
    );

    let currentStreak = 0;
    const cursor = new Date(now);
    cursor.setUTCHours(0, 0, 0, 0);
    while (activityForDate(utcDateKey(cursor), dailyActivity).total > 0) {
        currentStreak += 1;
        cursor.setUTCDate(cursor.getUTCDate() - 1);
    }

    const topModels = Object.entries(asRecord(stats.modelUsage))
        .flatMap(([group, models]) =>
            Object.entries(asRecord(models)).map(([model, uses]) => ({
                key: `${group}:${model}`,
                label: model,
                detail: `${MODEL_LABELS[group] || group} · ${count(uses).toLocaleString()} uses`,
                count: count(uses)
            }))
        )
        .filter((item) => item.count > 0)
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);

    const topPrompts = Object.entries(asRecord(stats.promptUsage))
        .map(([key, raw]) => {
            const prompt = asRecord(raw);
            const uses = count(prompt.count);
            const sources = Object.entries(asRecord(prompt.sources))
                .filter(([, sourceCount]) => count(sourceCount) > 0)
                .map(([source]) =>
                    source === 'user'
                        ? 'Chat'
                        : source === 'image'
                          ? 'Chat image'
                          : source === 'generator'
                            ? 'Generator'
                            : source
                );
            return {
                key,
                label: String(prompt.text || key),
                detail: `${sources.join(' + ') || 'Prompt'} · ${uses.toLocaleString()} uses`,
                count: uses
            };
        })
        .filter((item) => item.count > 0)
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);

    const topViews = Object.entries(asRecord(stats.viewCounts))
        .map(([view, visits]) => ({
            key: view,
            label: VIEW_LABELS[view] || view,
            detail: `${count(visits).toLocaleString()} visits`,
            count: count(visits)
        }))
        .filter((item) => item.count > 0)
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);

    return {
        activity,
        activeDays,
        currentStreak,
        busiestDay: busiestDay?.total ? busiestDay : null,
        topModels,
        topPrompts,
        topViews,
        lastUpdatedAt:
            typeof stats.lastUpdatedAt === 'string' && stats.lastUpdatedAt
                ? stats.lastUpdatedAt
                : null
    };
}

export const PROMPT_USAGE_LIMIT = 200;

/**
 * Counts one use of a prompt. Every chat message passes through here, so the table is capped:
 * past the limit the least used, then least recent, entries are dropped. Without the cap it would
 * grow with each message and be re-saved with the whole account state on every change.
 */
export function recordPromptUsage(
    promptUsage: Record<string, any> | undefined,
    prompt: string,
    source: string,
    now = new Date()
): Record<string, any> {
    const key = prompt.trim().slice(0, 300);
    const usage = { ...asRecord(promptUsage) };
    if (!key) return usage;
    const previous = asRecord(usage[key]);
    const sources = asRecord(previous.sources);
    usage[key] = {
        text: key,
        count: count(previous.count) + 1,
        sources: { ...sources, [source]: count(sources[source]) + 1 },
        lastUsedAt: now.toISOString()
    };

    const keys = Object.keys(usage);
    if (keys.length <= PROMPT_USAGE_LIMIT) return usage;
    const kept = keys
        .sort((a, b) => {
            const left = asRecord(usage[a]);
            const right = asRecord(usage[b]);
            return (
                count(right.count) - count(left.count) ||
                String(right.lastUsedAt || '').localeCompare(String(left.lastUsedAt || ''))
            );
        })
        .slice(0, PROMPT_USAGE_LIMIT);
    // The prompt just used is always kept, even when it ties at the bottom.
    if (!kept.includes(key)) kept[kept.length - 1] = key;
    return Object.fromEntries(kept.map((item) => [item, usage[item]]));
}
