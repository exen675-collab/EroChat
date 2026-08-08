import { describe, expect, it } from 'vitest';
import { buildStatsInsights } from '../src/client/modern/stats.js';

describe('modern stats insights', () => {
    it('builds a complete 14-day window and useful rankings', () => {
        const insights = buildStatsInsights(
            {
                dailyActivity: {
                    '2026-08-06': { messagesSent: 1, assistantReplies: 1 },
                    '2026-08-07': { messagesSent: 2, assistantReplies: 2, imagesGenerated: 1 },
                    '2026-08-08': { messagesSent: 3, assistantReplies: 3, generatorRuns: 2 }
                },
                modelUsage: {
                    text: { 'openai/gpt': 4 },
                    image: { 'image/model': 2 },
                    generator: { 'image/model': 5 }
                },
                promptUsage: {
                    portrait: {
                        text: 'A cinematic portrait',
                        count: 3,
                        sources: { generator: 3 }
                    },
                    greeting: { text: 'Hello', count: 1, sources: { user: 1 } }
                },
                viewCounts: { chat: 8, gallery: 3, stats: 1 },
                lastUpdatedAt: '2026-08-08T12:00:00.000Z'
            },
            new Date('2026-08-08T12:00:00.000Z')
        );

        expect(insights.activity).toHaveLength(14);
        expect(insights.activity[0].date).toBe('2026-07-26');
        expect(insights.activity.at(-1)).toMatchObject({
            date: '2026-08-08',
            messages: 6,
            media: 2,
            total: 8
        });
        expect(insights.activeDays).toBe(3);
        expect(insights.currentStreak).toBe(3);
        expect(insights.busiestDay?.date).toBe('2026-08-08');
        expect(insights.topModels.map((item) => item.key)).toEqual([
            'generator:image/model',
            'text:openai/gpt',
            'image:image/model'
        ]);
        expect(insights.topPrompts[0].label).toBe('A cinematic portrait');
        expect(insights.topViews[0]).toMatchObject({ label: 'Chat', count: 8 });
    });

    it('ignores invalid stored values and reports no current streak when today is quiet', () => {
        const insights = buildStatsInsights(
            {
                dailyActivity: {
                    '2026-08-07': { messagesSent: 2 },
                    '2026-08-08': { messagesSent: -1, assistantReplies: 'not a number' }
                },
                modelUsage: { text: { broken: Number.NaN, valid: 1 } },
                promptUsage: null,
                viewCounts: { chat: -4 }
            },
            new Date('2026-08-08T12:00:00.000Z')
        );

        expect(insights.currentStreak).toBe(0);
        expect(insights.activeDays).toBe(1);
        expect(insights.topModels).toHaveLength(1);
        expect(insights.topPrompts).toEqual([]);
        expect(insights.topViews).toEqual([]);
    });
});
