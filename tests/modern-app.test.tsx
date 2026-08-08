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
        expect(
            screen.queryByRole('button', { name: /Generate character/i })
        ).not.toBeInTheDocument();
        expect(
            screen.queryByRole('checkbox', { name: /generation reference/i })
        ).not.toBeInTheDocument();

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

    it('lets an admin generate, review, and publish when Browse is empty', async () => {
        localStorage.setItem(
            'erochat_data_user_42',
            JSON.stringify({
                settings: {
                    openrouterKey: 'sk-admin',
                    openrouterModel: 'openai/empty-catalog-model'
                },
                currentView: 'chat'
            })
        );
        const draft = {
            name: 'First Light',
            avatar: '🌅',
            description: 'The first public character.',
            appearance: 'Sunlit eyes.',
            background: 'A city waking from a long winter.',
            greeting: 'Good morning.',
            systemPrompt: 'You are First Light.',
            contextMessageCount: 20
        };
        let published = false;
        let generationBody: any = null;
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
                if (url === 'https://openrouter.ai/api/v1/models') {
                    return new Response(
                        JSON.stringify({ data: [{ id: 'openai/empty-catalog-model' }] }),
                        { status: 200 }
                    );
                }
                if (url === '/api/admin/characters/generate') {
                    generationBody = JSON.parse(String(init?.body));
                    return new Response(JSON.stringify({ draft }), { status: 200 });
                }
                if (url === '/api/admin/characters/publish') {
                    published = true;
                    return new Response(
                        JSON.stringify({
                            character: {
                                ...draft,
                                id: 1,
                                sourceCharacterId: 'ai-first',
                                creator: 'tester',
                                creatorId: 42,
                                isOwner: true,
                                imports: 0,
                                publishedAt: '2026-08-08 10:00:00',
                                updatedAt: '2026-08-08 10:00:00'
                            }
                        }),
                        { status: 201 }
                    );
                }
                if (url.startsWith('/api/characters/browse?')) {
                    return new Response(
                        JSON.stringify({
                            characters: published
                                ? [
                                      {
                                          ...draft,
                                          id: 1,
                                          sourceCharacterId: 'ai-first',
                                          creator: 'tester',
                                          creatorId: 42,
                                          isOwner: true,
                                          imports: 0,
                                          publishedAt: '2026-08-08 10:00:00',
                                          updatedAt: '2026-08-08 10:00:00'
                                      }
                                  ]
                                : []
                        }),
                        { status: 200 }
                    );
                }
                return new Response(JSON.stringify({}), { status: 200 });
            })
        );

        render(<ModernApp user={{ ...user, isAdmin: true }} />);
        await userEvent.click(screen.getAllByRole('button', { name: 'Browse' })[0]);

        expect(await screen.findByText('No characters published yet')).toBeInTheDocument();
        await userEvent.click(screen.getByRole('button', { name: 'Generate character' }));

        const dialog = screen.getByRole('dialog', { name: 'Generate a character' });
        expect(dialog).toHaveTextContent('0 selected');
        expect(dialog).toHaveTextContent('You can still generate the first public character.');
        await userEvent.click(within(dialog).getByRole('button', { name: 'Generate draft' }));

        const reviewDialog = await screen.findByRole('dialog', {
            name: 'Review generated character'
        });
        expect(within(reviewDialog).getByLabelText('Name *')).toHaveValue('First Light');
        await userEvent.click(
            within(reviewDialog).getByRole('button', { name: 'Publish character' })
        );

        expect(await screen.findByRole('heading', { name: 'First Light' })).toBeInTheDocument();
        expect(generationBody).toEqual({
            apiKey: 'sk-admin',
            model: 'openai/empty-catalog-model',
            referenceCharacterIds: [],
            brief: ''
        });
    });

    it('generates, edits, and publishes an admin character from selected references', async () => {
        localStorage.setItem(
            'erochat_data_user_42',
            JSON.stringify({
                settings: {
                    openrouterKey: 'sk-admin',
                    openrouterModel: 'anthropic/current-model'
                },
                currentView: 'chat'
            })
        );
        const shared = {
            id: 7,
            sourceCharacterId: 'authors-copy',
            creator: 'author',
            creatorId: 9,
            isOwner: false,
            name: 'Seraphine',
            avatar: '✨',
            description: 'A mysterious stranger.',
            appearance: 'Silver hair.',
            background: 'A distant city.',
            greeting: 'Welcome, traveler.',
            systemPrompt: 'You are Seraphine.',
            contextMessageCount: 20,
            imports: 2,
            publishedAt: '2026-08-08 10:00:00',
            updatedAt: '2026-08-08 10:00:00'
        };
        const generatedDraft = {
            name: 'Mara',
            avatar: '🧭',
            description: 'A restless cartographer.',
            appearance: 'Ink-stained hands.',
            background: 'She maps impossible places.',
            greeting: 'You found the edge of my map.',
            systemPrompt: 'You are Mara.',
            contextMessageCount: 24
        };
        const browseRequests: string[] = [];
        let generationBody: any = null;
        let publicationBody: any = null;
        const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
            const url = String(input);
            if (url.includes('/api/generator/jobs')) {
                return new Response(JSON.stringify({ jobs: [] }), { status: 200 });
            }
            if (url.includes('/api/generator/assets')) {
                return new Response(JSON.stringify({ assets: [] }), { status: 200 });
            }
            if (url === 'https://openrouter.ai/api/v1/models') {
                return new Response(JSON.stringify({ data: [{ id: 'openai/generator-model' }] }), {
                    status: 200
                });
            }
            if (url === '/api/admin/characters/generate') {
                generationBody = JSON.parse(String(init?.body));
                return new Response(JSON.stringify({ draft: generatedDraft }), { status: 200 });
            }
            if (url === '/api/admin/characters/publish') {
                publicationBody = JSON.parse(String(init?.body));
                return new Response(
                    JSON.stringify({
                        character: {
                            ...shared,
                            id: 21,
                            sourceCharacterId: 'ai-server-id',
                            name: publicationBody.draft.name,
                            creatorId: 42,
                            creator: 'tester',
                            isOwner: true
                        }
                    }),
                    { status: 201 }
                );
            }
            if (url.startsWith('/api/characters/browse?')) {
                browseRequests.push(url);
                return new Response(JSON.stringify({ characters: [shared] }), { status: 200 });
            }
            return new Response(JSON.stringify({}), { status: 200 });
        });
        vi.stubGlobal('fetch', fetchMock);

        render(<ModernApp user={{ ...user, isAdmin: true }} />);
        await userEvent.click(screen.getAllByRole('button', { name: 'Browse' })[0]);
        await screen.findByText('by @author');

        const search = screen.getByRole('searchbox', { name: 'Search public characters' });
        const sort = screen.getByRole('combobox', { name: 'Sort public characters' });
        await userEvent.type(search, 'sera');
        await userEvent.selectOptions(sort, 'popular');
        await waitFor(() =>
            expect(browseRequests).toContain('/api/characters/browse?sort=popular&q=sera')
        );

        const referenceCheckbox = await screen.findByRole('checkbox', {
            name: 'Use Seraphine as a generation reference'
        });
        await userEvent.click(referenceCheckbox);
        await userEvent.click(screen.getByRole('button', { name: 'Generate character' }));

        const configureDialog = screen.getByRole('dialog', { name: 'Generate a character' });
        expect(configureDialog).toHaveTextContent('1 selected');
        expect(within(configureDialog).getByText('Seraphine')).toBeInTheDocument();
        expect(within(configureDialog).getByLabelText('OpenRouter model *')).toHaveValue(
            'anthropic/current-model'
        );
        expect(within(configureDialog).getByLabelText('Creative brief (optional)')).toHaveAttribute(
            'maxlength',
            '2000'
        );

        await within(configureDialog).findByRole('option', {
            name: 'openai/generator-model'
        });
        await userEvent.selectOptions(
            within(configureDialog).getByLabelText('OpenRouter model *'),
            'openai/generator-model'
        );
        await userEvent.type(
            within(configureDialog).getByLabelText('Creative brief (optional)'),
            'A warm fantasy explorer'
        );
        await userEvent.click(
            within(configureDialog).getByRole('button', { name: 'Generate draft' })
        );

        const reviewDialog = await screen.findByRole('dialog', {
            name: 'Review generated character'
        });
        expect(within(reviewDialog).getByLabelText('Appearance')).toHaveValue('Ink-stained hands.');
        expect(within(reviewDialog).getByLabelText('Background')).toHaveValue(
            'She maps impossible places.'
        );
        expect(within(reviewDialog).getByLabelText('Greeting')).toHaveValue(
            'You found the edge of my map.'
        );
        expect(within(reviewDialog).getByLabelText('Context messages')).toHaveValue(24);

        const nameInput = within(reviewDialog).getByLabelText('Name *');
        await userEvent.clear(nameInput);
        await userEvent.type(nameInput, 'Mara Vale');
        await userEvent.clear(within(reviewDialog).getByLabelText('Description'));
        await userEvent.click(
            within(reviewDialog).getByRole('button', { name: 'Publish character' })
        );

        await waitFor(() =>
            expect(
                screen.queryByRole('dialog', { name: 'Review generated character' })
            ).not.toBeInTheDocument()
        );
        expect(generationBody).toEqual({
            apiKey: 'sk-admin',
            model: 'openai/generator-model',
            referenceCharacterIds: [7],
            brief: 'A warm fantasy explorer'
        });
        expect(publicationBody.draft).toMatchObject({
            name: 'Mara Vale',
            description: '',
            appearance: 'Ink-stained hands.',
            systemPrompt: 'You are Mara.'
        });
        expect(search).toHaveValue('');
        expect(sort).toHaveValue('newest');
        await waitFor(() =>
            expect(browseRequests.at(-1)).toBe('/api/characters/browse?sort=newest')
        );
        expect(referenceCheckbox).not.toBeChecked();
        expect(
            fetchMock.mock.calls.filter(([url]) => String(url) === '/api/admin/characters/generate')
        ).toHaveLength(1);
        expect(
            fetchMock.mock.calls.filter(([url]) => String(url) === '/api/admin/characters/publish')
        ).toHaveLength(1);
    });
});
