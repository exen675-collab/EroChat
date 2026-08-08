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
