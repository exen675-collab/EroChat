import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { StatsView } from '../src/client/modern/views/StatsView.js';
import type { ModernController } from '../src/client/modern/useModernController.js';

function createController(
    statistics = {},
    characters: unknown[] = [],
    galleryImages: unknown[] = [],
    generatorAssets: unknown[] = []
) {
    return {
        data: { statistics, characters, galleryImages },
        generatorAssets
    } as unknown as ModernController;
}

afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
});

describe('StatsView', () => {
    it('shows helpful empty states instead of empty rankings', () => {
        render(
            <StatsView
                controller={createController({}, [{ id: 1, name: 'Unused', messages: [] }])}
            />
        );

        expect(screen.getByText('Your next idea starts the chart')).toBeInTheDocument();
        expect(
            screen.getByText('Start a conversation to see your character breakdown.')
        ).toBeInTheDocument();
        expect(screen.queryByText('Unused')).not.toBeInTheDocument();
        expect(screen.getByText('0 day streak')).toBeInTheDocument();
    });

    it('separates recent totals from the all-time peak and labels chart bars', () => {
        const today = new Date().toISOString().slice(0, 10);
        render(
            <StatsView
                controller={createController({
                    dailyActivity: {
                        '2020-01-01': { messagesSent: 100 },
                        [today]: { messagesSent: 3, assistantReplies: 2, imagesGenerated: 1 }
                    }
                })}
            />
        );

        expect(screen.getByText('6')).toBeInTheDocument();
        expect(screen.getByText(/All-time peak:/)).toHaveTextContent('100 activities');
        expect(screen.getAllByRole('img')).toHaveLength(14);
        expect(screen.getByRole('img', { name: /5 messages and 1 media/ })).toBeInTheDocument();
        expect(screen.queryByText('Your next idea starts the chart')).not.toBeInTheDocument();
    });

    it('counts all generated media, not only the loaded gallery page', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn(async () =>
                Response.json({ total: 250, images: 248, videos: 2 }, { status: 200 })
            )
        );
        render(
            <StatsView
                controller={createController(
                    {},
                    [],
                    [
                        { id: 'saved', imageUrl: '/app/media/saved.png' },
                        { id: 'dup', imageUrl: '/app/media/a.png' }
                    ],
                    [{ id: 1, url: '/app/media/a.png' }]
                )}
            />
        );

        expect(await screen.findByText('251')).toBeInTheDocument();
        expect(screen.getByText('248 images generated · 2 videos')).toBeInTheDocument();
    });
});
