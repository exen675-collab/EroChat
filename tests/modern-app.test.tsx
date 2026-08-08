import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ModernApp } from '../src/client/modern/ModernApp.js';

const user = { id: 42, username: 'tester', credits: 99, isAdmin: false };

describe('ModernApp', () => {
    beforeEach(() => {
        localStorage.clear();
        window.location.hash = '#chat';
        vi.stubGlobal(
            'fetch',
            vi.fn(async (input: RequestInfo | URL) => {
                const url = String(input);
                if (url.includes('/api/generator/jobs')) {
                    return new Response(JSON.stringify({ jobs: [] }), { status: 200 });
                }
                if (url.includes('/api/generator/assets')) {
                    return new Response(JSON.stringify({ assets: [] }), { status: 200 });
                }
                return new Response(JSON.stringify({}), { status: 200 });
            })
        );
    });

    afterEach(() => {
        cleanup();
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
    });

    it('renders the modern chat and navigates between every primary view', async () => {
        render(<ModernApp user={user} />);
        expect(
            screen.getByRole('heading', { name: 'Start a conversation with Default Character' })
        ).toBeInTheDocument();

        const destinations = [
            ['Characters', 'Build a cast worth returning to.', '#characters'],
            ['Browse', 'Find your next conversation.', '#browse'],
            ['Create', 'Shape the scene.', '#generator'],
            ['Gallery', 'Every scene, in one place.', '#gallery'],
            ['Insights', 'Your creative rhythm.', '#stats']
        ] as const;

        for (const [buttonName, headingName, hash] of destinations) {
            await userEvent.click(screen.getAllByRole('button', { name: buttonName })[0]);
            expect(screen.getByRole('heading', { name: headingName })).toBeInTheDocument();
            await waitFor(() => expect(window.location.hash).toBe(hash));
        }
    });

    it('shows only the current settings sections', async () => {
        render(<ModernApp user={user} />);
        await userEvent.click(screen.getAllByRole('button', { name: /Settings/i })[0]);
        expect(screen.getByRole('button', { name: /Providers/i })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Generation/i })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Account/i })).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /Appearance/i })).not.toBeInTheDocument();
    });

    it('keeps loaded OpenRouter text and image models in separate selectors', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn(async (input: RequestInfo | URL) => {
                const url = String(input);
                if (url.includes('/api/generator/jobs')) {
                    return new Response(JSON.stringify({ jobs: [] }), { status: 200 });
                }
                if (url.includes('/api/generator/assets')) {
                    return new Response(JSON.stringify({ assets: [] }), { status: 200 });
                }
                if (url.endsWith('/api/v1/images/models')) {
                    return new Response(JSON.stringify({ data: [{ id: 'image/test-model' }] }), {
                        status: 200
                    });
                }
                if (url.endsWith('/api/v1/models')) {
                    return new Response(JSON.stringify({ data: [{ id: 'text/test-model' }] }), {
                        status: 200
                    });
                }
                return new Response(JSON.stringify({}), { status: 200 });
            })
        );

        render(<ModernApp user={user} />);
        await userEvent.click(screen.getAllByRole('button', { name: /Settings/i })[0]);
        await userEvent.type(screen.getByLabelText('OpenRouter API key'), 'sk-test');
        await userEvent.selectOptions(screen.getByLabelText('Active provider'), 'openrouter');

        const imageBox = screen.getByText('OpenRouter connection').closest('.m-provider-box');
        const textSection = screen
            .getByRole('heading', { name: 'Text provider' })
            .closest('section');
        expect(imageBox).not.toBeNull();
        expect(textSection).not.toBeNull();

        await userEvent.click(
            within(imageBox as HTMLElement).getByRole('button', { name: /Load models/i })
        );
        expect(
            await within(imageBox as HTMLElement).findByRole('option', {
                name: 'image/test-model'
            })
        ).toBeInTheDocument();
        expect(
            within(textSection as HTMLElement).queryByRole('option', { name: 'image/test-model' })
        ).not.toBeInTheDocument();

        await userEvent.click(
            within(textSection as HTMLElement).getByRole('button', { name: /Load models/i })
        );
        expect(
            await within(textSection as HTMLElement).findByRole('option', {
                name: 'text/test-model'
            })
        ).toBeInTheDocument();
        expect(
            within(imageBox as HTMLElement).queryByRole('option', { name: 'text/test-model' })
        ).not.toBeInTheDocument();
    });

    it('keeps character creation manual and limited to the supported fields', async () => {
        render(<ModernApp user={user} />);
        await userEvent.click(screen.getAllByRole('button', { name: /Characters/i })[0]);
        await userEvent.click(screen.getByRole('button', { name: /New character/i }));

        const dialog = screen.getByRole('dialog', { name: 'Create character' });
        expect(dialog).toHaveTextContent('Name *');
        expect(dialog).toHaveTextContent('Avatar');
        expect(dialog).toHaveTextContent('Description *');
        expect(dialog).toHaveTextContent('System prompt *');
        expect(dialog).not.toHaveTextContent('Appearance');
        expect(dialog).not.toHaveTextContent('Background');
        expect(dialog).not.toHaveTextContent('User information');
        expect(dialog).not.toHaveTextContent('Greeting');
        expect(screen.queryByRole('button', { name: /Generate/i })).not.toBeInTheDocument();
    });

    it('browses a community character, imports a private copy, and opens chat', async () => {
        const shared = {
            id: 7,
            sourceCharacterId: 'authors-copy',
            creator: 'author',
            creatorId: 9,
            isOwner: false,
            name: 'Seraphine',
            avatar: '✨',
            description: 'A mysterious stranger.',
            greeting: 'Welcome, traveler.',
            systemPrompt: 'You are Seraphine.',
            contextMessageCount: 20,
            imports: 2,
            publishedAt: '2026-08-08 10:00:00',
            updatedAt: '2026-08-08 10:00:00'
        };
        vi.stubGlobal(
            'fetch',
            vi.fn(async (input: RequestInfo | URL) => {
                const url = String(input);
                if (url.includes('/api/generator/jobs')) {
                    return new Response(JSON.stringify({ jobs: [] }), { status: 200 });
                }
                if (url.includes('/api/generator/assets')) {
                    return new Response(JSON.stringify({ assets: [] }), { status: 200 });
                }
                if (url.endsWith('/import')) {
                    return new Response(JSON.stringify({ character: shared }), { status: 200 });
                }
                if (url.includes('/api/characters/browse')) {
                    return new Response(JSON.stringify({ characters: [shared] }), { status: 200 });
                }
                return new Response(JSON.stringify({}), { status: 200 });
            })
        );

        render(<ModernApp user={user} />);
        await userEvent.click(screen.getAllByRole('button', { name: 'Browse' })[0]);
        expect(
            await screen.findByRole('heading', { name: 'Find your next conversation.' })
        ).toBeInTheDocument();
        expect(await screen.findByText('by @author')).toBeInTheDocument();

        await userEvent.click(screen.getByRole('button', { name: /Import & chat/i }));
        await waitFor(() => expect(window.location.hash).toBe('#chat'));
        expect(screen.getByText('Welcome, traveler.')).toBeInTheDocument();

        const stored = JSON.parse(localStorage.getItem('erochat_data_user_42') || '{}');
        expect(stored.characters).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ name: 'Seraphine', systemPrompt: 'You are Seraphine.' })
            ])
        );
    });

    it('uses an in-app publish modal and includes the automatic gallery thumbnail', async () => {
        localStorage.setItem(
            'erochat_data_user_42',
            JSON.stringify({
                characters: [
                    {
                        id: 'alicia',
                        name: 'Alicia',
                        avatar: 'A',
                        description: 'A curious traveler.',
                        systemPrompt: 'You are Alicia.',
                        messages: []
                    }
                ],
                currentCharacterId: 'alicia',
                currentView: 'chat',
                galleryImages: [
                    {
                        id: 'automatic-image',
                        characterId: 'alicia',
                        imageUrl: '/app/media/automatic.png',
                        createdAt: '2026-08-08T10:00:00.000Z'
                    }
                ]
            })
        );
        let publishedBody: any = null;
        const confirmSpy = vi.spyOn(window, 'confirm');
        vi.stubGlobal(
            'fetch',
            vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
                const url = String(input);
                if (url.includes('/api/generator/jobs')) {
                    return new Response(JSON.stringify({ jobs: [] }), { status: 200 });
                }
                if (url.includes('/api/generator/assets')) {
                    return new Response(JSON.stringify({ assets: [] }), { status: 200 });
                }
                if (url === '/api/characters/publish') {
                    publishedBody = JSON.parse(String(init?.body));
                    return new Response(JSON.stringify({ character: { id: 1 } }), {
                        status: 201
                    });
                }
                return new Response(JSON.stringify({}), { status: 200 });
            })
        );

        render(<ModernApp user={user} />);
        await userEvent.click(screen.getAllByRole('button', { name: /Characters/i })[0]);
        await userEvent.click(screen.getByRole('button', { name: 'Publish' }));

        const dialog = screen.getByRole('dialog', { name: 'Publish Alicia' });
        expect(dialog).toBeInTheDocument();
        expect(screen.getByRole('img', { name: 'Alicia thumbnail' })).toHaveAttribute(
            'src',
            '/app/media/automatic.png'
        );
        expect(confirmSpy).not.toHaveBeenCalled();

        await userEvent.click(screen.getByRole('button', { name: /Publish to Browse/i }));
        await waitFor(() =>
            expect(publishedBody?.character?.thumbnail).toBe('/app/media/automatic.png')
        );
        await waitFor(() =>
            expect(screen.queryByRole('dialog', { name: 'Publish Alicia' })).not.toBeInTheDocument()
        );
    });
});
