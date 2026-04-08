import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('statistics dashboard', () => {
    let state;
    let stats;

    beforeEach(async () => {
        vi.resetModules();
        document.body.innerHTML = `
            <div id="statsSummary"></div>
            <div id="statsActivityChart"></div>
            <div id="statsUsagePanels"></div>
            <div id="statsCharacterList"></div>
            <div id="statsPromptList"></div>
            <p id="statsTrackingNote"></p>
        `;

        ({ state } = await import('../js/state.js'));
        stats = await import('../js/stats.js');

        state.currentView = 'stats';
        state.currentCharacterId = 'default';
        state.characters = [
            {
                id: 'default',
                name: 'Default Character',
                avatar: '🤖',
                messages: []
            },
            {
                id: 'char-1',
                name: 'Astra',
                avatar: '✨',
                messages: [
                    {
                        id: 'm-1',
                        role: 'user',
                        content: 'Hello there',
                        createdAt: '2026-04-08T10:00:00.000Z'
                    },
                    {
                        id: 'm-2',
                        role: 'assistant',
                        content: 'General Kenobi',
                        createdAt: '2026-04-08T10:00:05.000Z'
                    }
                ]
            }
        ];
        state.messages = [];
        state.galleryImages = [
            {
                id: 'img-1',
                imageUrl: '/media/chat-1.png',
                createdAt: '2026-04-08T10:01:00.000Z'
            }
        ];
        state.generatorAssets = [
            {
                id: 10,
                mediaType: 'image',
                url: '/media/generator-1.png',
                prompt: 'cinematic portrait',
                createdAt: '2026-04-08T10:02:00.000Z'
            }
        ];
        state.generatorJobs = [{ id: 20, status: 'succeeded' }];
        state.statistics = stats.ensureStatisticsShape();
    });

    it('tracks message, model, and media activity', () => {
        stats.recordUserMessage({ content: 'Hello there' });
        stats.recordAssistantReply({
            textProvider: 'openrouter',
            model: 'openai/gpt-4.1-mini'
        });
        stats.recordGeneratedMedia({
            provider: 'swarm',
            prompt: 'cinematic portrait',
            source: 'chat'
        });
        stats.recordGeneratorBatch({
            provider: 'comfy',
            prompt: 'cinematic portrait',
            batchCount: 2
        });
        stats.trackViewVisit('stats');

        const dayKey = new Date().toISOString().slice(0, 10);

        expect(state.statistics.dailyActivity[dayKey]).toMatchObject({
            messagesSent: 1,
            assistantReplies: 1,
            imagesGenerated: 1,
            generatorRuns: 2,
            viewSwitches: 1
        });
        expect(state.statistics.modelUsage.text['OpenRouter · openai/gpt-4.1-mini']).toBe(1);
        expect(state.statistics.modelUsage.image['Chat image · SwarmUI']).toBe(1);
        expect(state.statistics.modelUsage.generator.ComfyUI).toBe(2);
        expect(Object.values(state.statistics.promptUsage)[0].text).toContain('cinematic portrait');
    });

    it('renders summary, rankings, and prompt history', () => {
        stats.recordUserMessage({ content: 'hello there' });
        stats.recordUserMessage({ content: 'hello there' });
        stats.recordAssistantReply({ textProvider: 'premium' });
        stats.recordGeneratedMedia({ provider: 'swarm', prompt: 'cinematic portrait' });
        stats.trackViewVisit('gallery');
        stats.renderStatisticsDashboard();

        expect(document.getElementById('statsSummary').textContent).toContain('Messages sent');
        expect(document.getElementById('statsSummary').textContent).toContain('Images generated');
        expect(document.getElementById('statsUsagePanels').textContent).toContain('Premium');
        expect(document.getElementById('statsCharacterList').textContent).toContain('Astra');
        expect(document.getElementById('statsPromptList').textContent).toContain('hello there');
        expect(document.getElementById('statsTrackingNote').textContent).toContain('Totals include');
    });
});