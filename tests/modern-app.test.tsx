import '@testing-library/jest-dom/vitest';
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ModernApp } from '../src/client/modern/ModernApp.js';

let savedState: any;
async function renderApp(element: Parameters<typeof render>[0]) {
    const previousFetch = globalThis.fetch;
    vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
        if (String(input) === '/api/user-state/load') {
            const raw = JSON.parse(String(init?.body)).localState;
            return new Response(
                JSON.stringify({ state: raw ? JSON.parse(raw) : null, revision: 0 })
            );
        }
        if (String(input) === '/api/user-state') {
            const body = JSON.parse(String(init?.body));
            savedState = body.state;
            return new Response(JSON.stringify({ revision: body.revision + 1 }));
        }
        return previousFetch(input, init);
    });
    render(element);
    await waitFor(() => expect(screen.queryByText(/Loading your data/)).not.toBeInTheDocument());
}
const user = { id: 42, username: 'tester', credits: 99, isAdmin: false };

describe('ModernApp', () => {
    beforeEach(() => {
        localStorage.clear();
        savedState = null;
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
        await renderApp(<ModernApp user={user} />);
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

    it('runs when the browser blocks site storage', async () => {
        vi.spyOn(window, 'localStorage', 'get').mockImplementation(() => {
            throw new DOMException('The operation is insecure.', 'SecurityError');
        });
        await renderApp(<ModernApp user={user} />);
        expect(
            screen.getByRole('heading', { name: 'Start a conversation with Default Character' })
        ).toBeInTheDocument();
        const toggle = document.querySelector<HTMLButtonElement>('.m-chat__head [aria-pressed]')!;
        const before = toggle.getAttribute('aria-pressed');
        await userEvent.click(toggle);
        expect(toggle.getAttribute('aria-pressed')).not.toBe(before);
    });

    it('focuses Settings when it opens and closes it with Escape', async () => {
        await renderApp(<ModernApp user={user} />);
        await userEvent.click(screen.getAllByRole('button', { name: /Settings/i })[0]);
        expect(screen.getByRole('dialog', { name: 'Settings' })).toHaveFocus();
        await userEvent.keyboard('{Escape}');
        expect(screen.queryByRole('dialog', { name: 'Settings' })).not.toBeInTheDocument();
    });

    it('asks before closing Settings with unsaved changes', async () => {
        const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
        await renderApp(<ModernApp user={user} />);
        await userEvent.click(screen.getAllByRole('button', { name: /Settings/i })[0]);
        await userEvent.keyboard('{Escape}');
        expect(confirm).not.toHaveBeenCalled();

        await userEvent.click(screen.getAllByRole('button', { name: /Settings/i })[0]);
        await userEvent.type(screen.getByLabelText('OpenRouter API key'), 'sk-new');
        await userEvent.keyboard('{Escape}');
        expect(confirm).toHaveBeenCalledOnce();
        expect(screen.getByRole('dialog', { name: 'Settings' })).toBeInTheDocument();

        confirm.mockReturnValue(true);
        await userEvent.click(screen.getByRole('button', { name: 'Close' }));
        expect(screen.queryByRole('dialog', { name: 'Settings' })).not.toBeInTheDocument();
    });

    it('shows only the current settings sections', async () => {
        await renderApp(<ModernApp user={user} />);
        await userEvent.click(screen.getAllByRole('button', { name: /Settings/i })[0]);
        expect(screen.getByRole('button', { name: /Providers/i })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Generation/i })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Account/i })).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /Appearance/i })).not.toBeInTheDocument();
    });

    it('keeps image tuning and model selection out of settings', async () => {
        await renderApp(<ModernApp user={user} />);
        await userEvent.click(screen.getAllByRole('button', { name: /Settings/i })[0]);
        const imageSection = screen
            .getByRole('heading', { name: 'Image providers' })
            .closest('section')!;
        expect(
            within(imageSection).queryByRole('button', { name: /Load models/i })
        ).not.toBeInTheDocument();
        await userEvent.click(screen.getByRole('button', { name: 'Generation' }));
        expect(screen.queryByText('Default image tuning')).not.toBeInTheDocument();
    });

    it('toggles the character panel and reopens chat from the characters view', async () => {
        await renderApp(<ModernApp user={user} />);
        expect(screen.getByRole('button', { name: 'Chat with Default Character' })).toHaveClass(
            'is-active'
        );
        await userEvent.click(screen.getByRole('button', { name: 'Show character panel' }));
        expect(document.querySelector('.m-chat-layout')).toHaveClass('is-panel-open');
        expect(screen.getByRole('heading', { name: 'Default Character' })).toBeInTheDocument();
        expect(localStorage.getItem('erochat-chat-panel')).toBe('open');
        await userEvent.click(screen.getByRole('button', { name: 'Close character panel' }));
        expect(document.querySelector('.m-chat-layout')).not.toHaveClass('is-panel-open');
        expect(localStorage.getItem('erochat-chat-panel')).toBe('closed');
        await userEvent.click(screen.getAllByRole('button', { name: 'Characters' })[0]);
        await userEvent.click(screen.getByRole('button', { name: 'Select Default Character' }));
        expect(screen.getByRole('textbox', { name: 'Message' })).toBeInTheDocument();
    });

    it('offers suggestions and draft upgrades from the composer tools menu', async () => {
        await renderApp(<ModernApp user={user} />);
        await userEvent.click(screen.getByRole('button', { name: 'Message tools' }));
        const menu = screen.getByRole('menu');
        expect(within(menu).getByRole('menuitem', { name: /Suggest replies/ })).toBeEnabled();
        expect(within(menu).getByRole('menuitem', { name: /Polish/ })).toBeDisabled();
        await userEvent.keyboard('{Escape}');
        expect(screen.queryByRole('menu')).not.toBeInTheDocument();
        await userEvent.type(screen.getByRole('textbox', { name: 'Message' }), 'Hello');
        await userEvent.click(screen.getByRole('button', { name: 'Message tools' }));
        expect(screen.getByRole('menuitem', { name: /Polish/ })).toBeEnabled();
    });

    it('uses generator assets as character thumbnails', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn(
                async (input: RequestInfo | URL) =>
                    new Response(
                        JSON.stringify(
                            String(input).includes('/api/generator/assets')
                                ? {
                                      assets: [
                                          {
                                              id: 1,
                                              mediaType: 'image',
                                              characterId: 'default',
                                              url: '/media/generated.png'
                                          }
                                      ]
                                  }
                                : { jobs: [] }
                        )
                    )
            )
        );
        await renderApp(<ModernApp user={user} />);
        await waitFor(() =>
            expect(
                screen
                    .getByRole('button', { name: 'Chat with Default Character' })
                    .querySelector('img')
            ).toHaveAttribute('src', '/media/generated.png')
        );
    });

    it('scrolls to the full stream height and follows late layout changes', async () => {
        let resize: (() => void) | undefined;
        vi.stubGlobal(
            'ResizeObserver',
            class {
                constructor(callback: () => void) {
                    resize = callback;
                }
                observe() {}
                disconnect() {}
            }
        );
        vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockReturnValue(1800);
        await renderApp(<ModernApp user={user} />);
        const stream = document.querySelector('.m-chat__stream')!;
        expect(stream.scrollTop).toBe(1800);
        vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockReturnValue(2200);
        resize?.();
        expect(stream.scrollTop).toBe(2200);
    });

    it('asks before discarding edits in the character editor', async () => {
        const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
        await renderApp(<ModernApp user={user} />);
        await userEvent.click(screen.getAllByRole('button', { name: /Characters/i })[0]);
        await userEvent.click(screen.getByRole('button', { name: /New character/i }));
        const dialog = screen.getByRole('dialog', { name: 'Create character' });
        await userEvent.type(within(dialog).getByRole('textbox', { name: 'Name *' }), 'Draft');
        await userEvent.keyboard('{Escape}');
        expect(confirm).toHaveBeenCalledOnce();
        expect(dialog).toBeInTheDocument();

        await userEvent.clear(within(dialog).getByRole('textbox', { name: 'Name *' }));
        await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
        expect(confirm).toHaveBeenCalledOnce();
        expect(screen.queryByRole('dialog', { name: 'Create character' })).not.toBeInTheDocument();
    });

    it('keeps character creation manual and limited to the supported fields', async () => {
        await renderApp(<ModernApp user={user} />);
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

    it('finds chats by message text as well as by name', async () => {
        localStorage.setItem(
            'erochat_data_user_42',
            JSON.stringify({
                characters: [
                    {
                        id: 'nova',
                        name: 'Nova',
                        systemPrompt: 'You are Nova.',
                        messages: [
                            {
                                id: 'a1',
                                role: 'assistant',
                                content:
                                    'We met at the lighthouse.\n---IMAGE_PROMPT START---\nharbor_tag\n---IMAGE_PROMPT END---'
                            }
                        ]
                    },
                    { id: 'ash', name: 'Ash', systemPrompt: 'You are Ash.', messages: [] }
                ],
                currentCharacterId: 'ash'
            })
        );
        await renderApp(<ModernApp user={user} />);
        const search = screen.getByRole('searchbox', { name: 'Search chats' });
        const listed = () =>
            within(screen.getByRole('region', { name: 'Conversations' }))
                .queryAllByRole('button', { name: /^Chat with/ })
                .map((button) => button.getAttribute('aria-label'));

        await userEvent.type(search, 'LIGHTHOUSE');
        expect(listed()).toEqual(['Chat with Nova']);
        await userEvent.clear(search);
        await userEvent.type(search, 'harbor_tag');
        expect(listed()).toEqual([]);
        await userEvent.clear(search);
        await userEvent.type(search, 'ash');
        expect(listed()).toEqual(['Chat with Ash']);
    });

    it('does not save a cleared credit amount as zero', async () => {
        const requests: Array<{ url: string; method: string; body?: string }> = [];
        vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
            const url = String(input);
            requests.push({ url, method: init?.method ?? 'GET', body: init?.body as string });
            if (url === '/api/admin/users' && (init?.method ?? 'GET') === 'GET') {
                return new Response(
                    JSON.stringify({
                        users: [
                            {
                                id: 5,
                                username: 'member',
                                credits: 40,
                                isAdmin: false,
                                createdAt: '2026-01-01T00:00:00Z'
                            }
                        ]
                    })
                );
            }
            if (url.startsWith('/api/generator/')) {
                return new Response(JSON.stringify({ jobs: [], assets: [] }));
            }
            return new Response(JSON.stringify({ user: { id: 5, credits: 55 } }));
        });
        await renderApp(<ModernApp user={{ ...user, isAdmin: true }} />);

        await userEvent.click(screen.getAllByRole('button', { name: /Settings/i })[0]);
        await userEvent.click(screen.getByRole('button', { name: /Admin/i }));
        const input = await screen.findByRole('spinbutton', { name: 'Credits for member' });
        const row = input.closest('article')!;
        const update = within(row).getByRole('button', { name: 'Update' });
        expect(update).toBeDisabled();

        await userEvent.clear(input);
        expect(update).toBeDisabled();
        expect(requests.some((request) => request.method === 'PATCH')).toBe(false);

        await userEvent.type(input, '55');
        expect(update).toBeEnabled();
        await userEvent.click(update);
        await waitFor(() =>
            expect(requests.find((request) => request.method === 'PATCH')).toBeDefined()
        );
        const patch = requests.find((request) => request.method === 'PATCH')!;
        expect(patch.url).toBe('/api/admin/users/5/credits');
        expect(JSON.parse(patch.body!)).toEqual({ credits: 55 });
    });

    it('lets an administrator create an account from Settings', async () => {
        const requests: Array<{ url: string; method: string; body?: string }> = [];
        vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
            const url = String(input);
            const method = init?.method ?? 'GET';
            requests.push({ url, method, body: init?.body as string });
            if (url === '/api/admin/users' && method === 'POST') {
                return new Response(
                    JSON.stringify({ user: { id: 9, username: 'guest', credits: 100 } }),
                    { status: 201 }
                );
            }
            if (url === '/api/admin/users') return new Response(JSON.stringify({ users: [] }));
            if (url.startsWith('/api/generator/')) {
                return new Response(JSON.stringify({ jobs: [], assets: [] }));
            }
            return new Response(JSON.stringify({}));
        });
        await renderApp(<ModernApp user={{ ...user, isAdmin: true }} />);
        await userEvent.click(screen.getAllByRole('button', { name: /Settings/i })[0]);
        await userEvent.click(screen.getByRole('button', { name: /Admin/i }));

        const form = (await screen.findByText('Add an account')).closest('section')!;
        const create = within(form).getByRole('button', { name: 'Create account' });
        expect(create).toBeDisabled();
        await userEvent.type(within(form).getByLabelText('Username'), 'guest');
        await userEvent.type(within(form).getByLabelText('Password'), 'guest-pass');
        await userEvent.click(create);

        expect(await screen.findByText('Created @guest.')).toBeInTheDocument();
        const post = requests.find((request) => request.method === 'POST')!;
        expect(JSON.parse(post.body!)).toEqual({ username: 'guest', password: 'guest-pass' });
        expect(within(form).getByLabelText('Username')).toHaveValue('');
        expect(within(form).getByLabelText('Password')).toHaveValue('');
    });

    it('shows a renamed account everywhere and clears the password fields', async () => {
        let profileBody: any = null;
        vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
            if (String(input) === '/api/auth/profile') {
                profileBody = JSON.parse(String(init?.body));
                return new Response(
                    JSON.stringify({
                        ok: true,
                        user: { id: 42, username: 'renamed', credits: 99, isAdmin: false }
                    })
                );
            }
            return new Response(JSON.stringify({ jobs: [], assets: [] }));
        });
        await renderApp(<ModernApp user={user} />);
        await userEvent.click(screen.getAllByRole('button', { name: /Settings/i })[0]);
        await userEvent.click(screen.getByRole('button', { name: /Account/i }));
        const username = screen.getByRole('textbox', { name: 'Username' });
        await userEvent.clear(username);
        await userEvent.type(username, 'renamed');
        const current = screen.getByLabelText('Current password');
        await userEvent.type(current, 'old-secret');
        await userEvent.type(screen.getByLabelText('New password'), 'new-secret');
        await userEvent.type(screen.getByLabelText('Confirm new password'), 'new-secret');
        await userEvent.click(screen.getByRole('button', { name: /Save profile/ }));

        await screen.findByText('Profile updated.');
        expect(profileBody).toMatchObject({ username: 'renamed', newPassword: 'new-secret' });
        expect(screen.getByText('Signed in as @renamed.')).toBeInTheDocument();
        expect(current).toHaveValue('');
        expect(screen.getByLabelText('New password')).toHaveValue('');
    });

    it('editing a character keeps the active chat character and its messages', async () => {
        localStorage.setItem(
            'erochat_data_user_42',
            JSON.stringify({
                settings: { openrouterKey: 'sk-test', openrouterModel: 'test/model' },
                characters: [
                    {
                        id: 'nova',
                        name: 'Nova',
                        avatar: 'N',
                        description: 'Nova.',
                        systemPrompt: 'You are Nova.',
                        messages: [{ id: 'u1', role: 'user', content: 'Hello Nova.' }]
                    },
                    {
                        id: 'other',
                        name: 'Other',
                        avatar: 'O',
                        description: 'Other.',
                        systemPrompt: 'You are Other.',
                        messages: []
                    }
                ],
                currentCharacterId: 'nova',
                currentView: 'characters'
            })
        );
        await renderApp(<ModernApp user={user} />);
        await userEvent.click(screen.getAllByRole('button', { name: /Characters/i })[0]);

        const otherCard = screen.getByRole('button', { name: 'Select Other' }).closest('article');
        await userEvent.click(within(otherCard!).getByRole('button', { name: 'Edit' }));
        const dialog = screen.getByRole('dialog', { name: 'Edit Other' });
        await userEvent.click(within(dialog).getByRole('button', { name: /Save character/ }));

        const novaCard = screen.getByRole('button', { name: 'Select Nova' }).closest('article');
        expect(novaCard).toHaveTextContent('Active now');
        expect(otherCard).not.toHaveTextContent('Active now');

        // Autosave runs every 500 ms; wait across two ticks so the saved state reflects the edit.
        await new Promise((resolve) => setTimeout(resolve, 1200));
        expect(savedState.currentCharacterId).toBe('nova');
        const saved = savedState.characters.find((item: any) => item.id === 'nova');
        expect(saved.messages.map((message: any) => message.id)).toEqual(['u1']);
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

        await renderApp(<ModernApp user={user} />);
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
        expect(
            within(document.querySelector<HTMLElement>('.m-chat__stream')!).getByText(
                'Welcome, traveler.'
            )
        ).toBeInTheDocument();

        await waitFor(() =>
            expect(savedState?.characters.some((item: any) => item.name === 'Seraphine')).toBe(true)
        );
        const stored = savedState;
        expect(stored.characters).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ name: 'Seraphine', systemPrompt: 'You are Seraphine.' })
            ])
        );
    });

    it('asks before discarding a generated character under review', async () => {
        localStorage.setItem(
            'erochat_data_user_42',
            JSON.stringify({ settings: { openrouterKey: 'sk-admin', openrouterModel: 'a/model' } })
        );
        vi.stubGlobal(
            'fetch',
            vi.fn(async (input: RequestInfo | URL) => {
                const url = String(input);
                if (url === 'https://openrouter.ai/api/v1/models') {
                    return new Response(JSON.stringify({ data: [{ id: 'a/model' }] }));
                }
                if (url === '/api/admin/characters/generate') {
                    return new Response(
                        JSON.stringify({
                            draft: {
                                name: 'Mara',
                                avatar: '🧭',
                                description: '',
                                appearance: '',
                                background: '',
                                greeting: '',
                                systemPrompt: 'You are Mara.',
                                contextMessageCount: 20
                            }
                        })
                    );
                }
                return new Response(JSON.stringify({ characters: [], jobs: [], assets: [] }));
            })
        );
        const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
        await renderApp(<ModernApp user={{ ...user, isAdmin: true }} />);
        await userEvent.click(screen.getAllByRole('button', { name: 'Browse' })[0]);
        await userEvent.click(await screen.findByRole('button', { name: 'Generate character' }));
        await userEvent.click(await screen.findByRole('button', { name: 'Generate draft' }));
        const review = await screen.findByRole('dialog', { name: 'Review generated character' });

        await userEvent.keyboard('{Escape}');
        expect(confirm).toHaveBeenCalledWith('Discard this generated character?');
        expect(review).toBeInTheDocument();
        confirm.mockReturnValue(true);
        await userEvent.click(within(review).getByRole('button', { name: 'Cancel' }));
        expect(
            screen.queryByRole('dialog', { name: 'Review generated character' })
        ).not.toBeInTheDocument();
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

        await renderApp(<ModernApp user={user} />);
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

        await renderApp(<ModernApp user={{ ...user, isAdmin: true }} />);
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

        await renderApp(<ModernApp user={{ ...user, isAdmin: true }} />);
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
    it('drops a catalog character from the generation references when an admin removes it', async () => {
        const shared = {
            id: 7,
            sourceCharacterId: 'authors-copy',
            creator: 'author',
            creatorId: 9,
            isOwner: false,
            name: 'Seraphine',
            avatar: '✨',
            systemPrompt: 'You are Seraphine.',
            contextMessageCount: 20,
            imports: 0
        };
        let published = [shared];
        vi.stubGlobal(
            'fetch',
            vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
                const url = String(input);
                if (url === '/api/admin/public-characters/7' && init?.method === 'DELETE') {
                    published = [];
                    return new Response(JSON.stringify({ ok: true }), { status: 200 });
                }
                if (url.startsWith('/api/characters/browse?')) {
                    return new Response(JSON.stringify({ characters: published }), {
                        status: 200
                    });
                }
                return new Response(JSON.stringify({ jobs: [], assets: [] }), { status: 200 });
            })
        );
        vi.spyOn(window, 'confirm').mockReturnValue(true);

        await renderApp(<ModernApp user={{ ...user, isAdmin: true }} />);
        await userEvent.click(screen.getAllByRole('button', { name: 'Browse' })[0]);
        await userEvent.click(
            await screen.findByRole('checkbox', { name: 'Use Seraphine as a generation reference' })
        );
        expect(screen.getByText(/originality reference\s+selected/)).toBeInTheDocument();

        await userEvent.click(screen.getByRole('button', { name: /Remove from catalog/ }));
        await screen.findByText('No characters published yet');
        expect(screen.queryByText(/originality reference/)).not.toBeInTheDocument();
    });
    it('loads further pages of the public catalog on request', async () => {
        const publication = (id: number) => ({
            id,
            sourceCharacterId: `c-${id}`,
            creator: 'author',
            creatorId: 9,
            isOwner: false,
            name: `Character ${id}`,
            avatar: '✨',
            systemPrompt: 'Prompt.',
            contextMessageCount: 20,
            imports: 0
        });
        const browseRequests: string[] = [];
        vi.stubGlobal(
            'fetch',
            vi.fn(async (input: RequestInfo | URL) => {
                const url = String(input);
                if (url.startsWith('/api/characters/browse?')) {
                    browseRequests.push(url);
                    const more = url.includes('offset=1');
                    return new Response(
                        JSON.stringify({
                            characters: [publication(more ? 2 : 1)],
                            hasMore: !more
                        }),
                        { status: 200 }
                    );
                }
                return new Response(JSON.stringify({ jobs: [], assets: [] }), { status: 200 });
            })
        );

        await renderApp(<ModernApp user={user} />);
        await userEvent.click(screen.getAllByRole('button', { name: 'Browse' })[0]);
        await screen.findByText('Character 1');
        await userEvent.click(screen.getByRole('button', { name: /Load more characters/ }));

        expect(await screen.findByText('Character 2')).toBeInTheDocument();
        expect(screen.getByText('Character 1')).toBeInTheDocument();
        expect(browseRequests.at(-1)).toBe('/api/characters/browse?sort=newest&offset=1');
        expect(
            screen.queryByRole('button', { name: /Load more characters/ })
        ).not.toBeInTheDocument();
    });
    it('keeps the Create prompt, chips, negative prompt, and batch size after leaving', async () => {
        await renderApp(<ModernApp user={user} />);
        await userEvent.click(screen.getAllByRole('button', { name: 'Create' })[0]);
        await userEvent.type(screen.getByRole('textbox', { name: 'Prompt' }), 'A harbor');
        await userEvent.click(screen.getByRole('button', { name: 'cinematic lighting' }));
        await userEvent.type(screen.getByRole('textbox', { name: 'Negative prompt' }), 'blur');
        await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Batch size' }), '3');

        await userEvent.click(screen.getAllByRole('button', { name: 'Gallery' })[0]);
        await userEvent.click(screen.getAllByRole('button', { name: 'Create' })[0]);
        expect(screen.getByRole('textbox', { name: 'Prompt' })).toHaveValue(
            'A harbor, cinematic lighting'
        );
        expect(screen.getByRole('textbox', { name: 'Negative prompt' })).toHaveValue('blur');
        expect(screen.getByRole('combobox', { name: 'Batch size' })).toHaveValue('3');
        await waitFor(() =>
            expect(savedState?.generatorPrefs).toMatchObject({
                prompt: 'A harbor, cinematic lighting',
                negativePrompt: 'blur',
                batchCount: 3
            })
        );
    });

    it('lets LoRAs be typed as written and saves them on the preset', async () => {
        await renderApp(<ModernApp user={user} />);
        await userEvent.click(screen.getAllByRole('button', { name: 'Create' })[0]);
        const field = screen.getByRole('textbox', { name: /LoRAs/ });
        await userEvent.type(field, 'style:0.5, detail');
        expect(field).toHaveValue('style:0.5, detail');
        await waitFor(() =>
            expect(savedState?.generatorPrefs.presets).toContainEqual(
                expect.objectContaining({
                    loras: [
                        { name: 'style', weight: 0.5 },
                        { name: 'detail', weight: 1 }
                    ]
                })
            )
        );
        await userEvent.tab();
        expect(field).toHaveValue('style:0.5, detail:1');
    });

    it('reshapes the preset size when an aspect ratio is chosen', async () => {
        await renderApp(<ModernApp user={user} />);
        await userEvent.click(screen.getAllByRole('button', { name: 'Create' })[0]);
        const ratio = screen.getByRole('combobox', { name: 'Aspect ratio' });
        await userEvent.selectOptions(ratio, '16:9');
        const width = Number(
            (screen.getByRole('spinbutton', { name: 'Width' }) as HTMLInputElement).value
        );
        const height = Number(
            (screen.getByRole('spinbutton', { name: 'Height' }) as HTMLInputElement).value
        );
        expect(width / height).toBeCloseTo(16 / 9, 1);
        expect(ratio).toHaveValue('16:9');
    });

    it('removes generated and saved items from the gallery', async () => {
        localStorage.setItem(
            'erochat_data_user_42',
            JSON.stringify({
                galleryImages: [
                    { id: 'saved-1', imageUrl: '/app/media/saved.png', createdAt: '2026-08-01' }
                ]
            })
        );
        const deletes: string[] = [];
        vi.stubGlobal(
            'fetch',
            vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
                const url = String(input);
                if (init?.method === 'DELETE') {
                    deletes.push(url);
                    return new Response(JSON.stringify({ ok: true }));
                }
                if (url.startsWith('/api/generator/assets')) {
                    return new Response(
                        JSON.stringify({
                            assets: [
                                {
                                    id: 9,
                                    mediaType: 'image',
                                    url: '/app/media/9.png',
                                    source: 'manual',
                                    createdAt: '2026-08-09'
                                }
                            ],
                            nextCursor: null
                        })
                    );
                }
                return new Response(JSON.stringify({ jobs: [] }));
            })
        );
        vi.spyOn(window, 'confirm').mockReturnValue(true);
        await renderApp(<ModernApp user={user} />);
        await userEvent.click(screen.getAllByRole('button', { name: 'Gallery' })[0]);
        const sources = () =>
            screen
                .queryAllByRole('img', { name: 'Generated media' })
                .map((img) => img.getAttribute('src'));
        await waitFor(() =>
            expect(sources()).toEqual(['/app/media/9.png', '/app/media/saved.png'])
        );

        for (const expected of [['/app/media/saved.png'], []]) {
            await userEvent.click(screen.getAllByRole('img', { name: 'Generated media' })[0]);
            await userEvent.click(screen.getByRole('button', { name: /Remove from gallery/ }));
            await waitFor(() => expect(sources()).toEqual(expected));
        }
        expect(deletes).toEqual(['/api/generator/assets/9']);
        await waitFor(() => expect(savedState?.galleryImages).toEqual([]));
    });

    it('loads older generated media into the gallery on request', async () => {
        const asset = (id: number) => ({
            id,
            jobId: id,
            mediaType: 'image',
            url: `/app/media/${id}.png`,
            source: 'manual',
            characterId: 'default',
            createdAt: `2026-08-0${id}T10:00:00Z`
        });
        const assetRequests: string[] = [];
        vi.stubGlobal(
            'fetch',
            vi.fn(async (input: RequestInfo | URL) => {
                const url = String(input);
                if (url.startsWith('/api/generator/assets')) {
                    assetRequests.push(url);
                    const older = url.includes('cursor=5');
                    return new Response(
                        JSON.stringify(
                            older
                                ? { assets: [asset(2)], nextCursor: null }
                                : { assets: [asset(5)], nextCursor: 5 }
                        ),
                        { status: 200 }
                    );
                }
                return new Response(JSON.stringify({ jobs: [] }), { status: 200 });
            })
        );

        await renderApp(<ModernApp user={user} />);
        await userEvent.click(screen.getAllByRole('button', { name: 'Gallery' })[0]);
        const images = () =>
            screen
                .getAllByRole('img', { name: 'Generated media' })
                .map((img) => img.getAttribute('src'));
        await waitFor(() => expect(images()).toEqual(['/app/media/5.png']));
        const card = screen.getByRole('img', { name: 'Generated media' }).closest('article')!;
        expect(within(card).getByText('Generator')).toBeInTheDocument();
        expect(within(card).getByText('Default Character')).toBeInTheDocument();

        await userEvent.click(screen.getByRole('button', { name: /Load older media/ }));
        await waitFor(() => expect(images()).toEqual(['/app/media/5.png', '/app/media/2.png']));
        expect(assetRequests.at(-1)).toBe('/api/generator/assets?limit=100&cursor=5');
        expect(screen.queryByRole('button', { name: /Load older media/ })).not.toBeInTheDocument();
    });
    it('exports a character card that imports back with the same profile', async () => {
        localStorage.setItem(
            'erochat_data_user_42',
            JSON.stringify({
                characters: [
                    {
                        id: 'nova',
                        name: 'Nova',
                        avatar: '🌙',
                        description: 'A night courier.',
                        appearance: 'Silver jacket.',
                        background: 'The old city.',
                        greeting: 'Got a delivery?',
                        systemPrompt: 'You are Nova.',
                        contextMessageCount: 32,
                        messages: []
                    }
                ],
                currentCharacterId: 'nova',
                currentView: 'characters'
            })
        );
        let exported: Blob | null = null;
        vi.spyOn(URL, 'createObjectURL').mockImplementation((blob) => {
            exported = blob as Blob;
            return 'blob:card';
        });
        vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
        vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
        vi.stubGlobal(
            'fetch',
            vi.fn(async (input: RequestInfo | URL) => {
                if (String(input) === '/api/characters/import-card') {
                    return new Response(
                        JSON.stringify({
                            card: JSON.parse(await exported!.text()),
                            thumbnailUrl: null
                        }),
                        { status: 201 }
                    );
                }
                return new Response(JSON.stringify({ jobs: [], assets: [] }), { status: 200 });
            })
        );

        await renderApp(<ModernApp user={user} />);
        await userEvent.click(screen.getAllByRole('button', { name: /Characters/i })[0]);
        await userEvent.click(screen.getByRole('button', { name: /Edit/ }));
        await userEvent.click(screen.getByRole('button', { name: /Export card/ }));
        expect(exported).not.toBeNull();
        await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));

        const input = document.querySelector<HTMLInputElement>('input[type="file"]')!;
        await userEvent.upload(
            input,
            new File(['{}'], 'nova.card.json', { type: 'application/json' })
        );
        await waitFor(() => expect(savedState?.characters).toHaveLength(2));
        expect(savedState.characters[1]).toMatchObject({
            name: 'Nova',
            avatar: '🌙',
            description: 'A night courier.',
            appearance: 'Silver jacket.',
            background: 'The old city.',
            greeting: 'Got a delivery?',
            systemPrompt: 'You are Nova.',
            contextMessageCount: 32
        });
    });

    it("keeps a third-party card's own system prompt on import", async () => {
        const cards = [
            { name: 'Ash', description: 'A ranger.', system_prompt: 'Never break character.' },
            {
                name: 'Bea',
                description: 'A baker.',
                system_prompt: 'Rules first.\n{{original}}\nWrite as {{char}}.'
            }
        ];
        vi.stubGlobal(
            'fetch',
            vi.fn(async (input: RequestInfo | URL) => {
                if (String(input) === '/api/characters/import-card') {
                    return new Response(
                        JSON.stringify({ card: { data: cards.shift() }, thumbnailUrl: null }),
                        { status: 201 }
                    );
                }
                return new Response(JSON.stringify({ jobs: [], assets: [] }), { status: 200 });
            })
        );
        await renderApp(<ModernApp user={user} />);
        await userEvent.click(screen.getAllByRole('button', { name: /Characters/i })[0]);
        const input = document.querySelector<HTMLInputElement>('input[type="file"]')!;
        await userEvent.upload(input, new File(['{}'], 'a.json', { type: 'application/json' }));
        await screen.findByRole('heading', { name: 'Ash' });
        await userEvent.upload(input, new File(['{}'], 'b.json', { type: 'application/json' }));
        await screen.findByRole('heading', { name: 'Bea' });

        await waitFor(() => expect(savedState?.characters).toHaveLength(3));
        const [, ash, bea] = savedState.characters;
        expect(ash.systemPrompt).toBe(
            'Never break character.\n\nYou are roleplaying as Ash. Stay in character and respond naturally.\n\nDescription:\nA ranger.'
        );
        expect(bea.systemPrompt).toBe(
            'Rules first.\nYou are roleplaying as Bea. Stay in character and respond naturally.\n\nDescription:\nA baker.\nWrite as Bea.'
        );
    });

    it("offers a card's alternate greetings as versions of the opening message", async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn(async (input: RequestInfo | URL) => {
                if (String(input) === '/api/characters/import-card') {
                    return new Response(
                        JSON.stringify({
                            card: {
                                data: {
                                    name: 'Cass',
                                    first_mes: 'Welcome aboard.',
                                    alternate_greetings: [
                                        '{{char}} waves at {{user}}.',
                                        '',
                                        'Welcome aboard.',
                                        42
                                    ]
                                }
                            },
                            thumbnailUrl: null
                        }),
                        { status: 201 }
                    );
                }
                return new Response(JSON.stringify({ jobs: [], assets: [] }), { status: 200 });
            })
        );
        await renderApp(<ModernApp user={user} />);
        await userEvent.click(screen.getAllByRole('button', { name: /Characters/i })[0]);
        const input = document.querySelector<HTMLInputElement>('input[type="file"]')!;
        await userEvent.upload(input, new File(['{}'], 'c.json', { type: 'application/json' }));
        await screen.findByRole('heading', { name: 'Cass' });
        await userEvent.click(screen.getByRole('button', { name: 'Select Cass' }));

        expect(
            within(document.querySelector<HTMLElement>('.m-chat__stream')!).getByText(
                'Welcome aboard.'
            )
        ).toBeInTheDocument();
        expect(screen.getByLabelText('Reply version')).toHaveTextContent('1/2');
        await userEvent.click(screen.getByRole('button', { name: 'Next version' }));
        expect(
            within(document.querySelector<HTMLElement>('.m-chat__stream')!).getByText(
                'Cass waves at tester.'
            )
        ).toBeInTheDocument();
        await waitFor(() =>
            expect(savedState.characters.at(-1).alternateGreetings).toEqual([
                'Cass waves at tester.',
                'Welcome aboard.'
            ])
        );
    });

    it('imports the same character card file again when chosen twice', async () => {
        let imports = 0;
        vi.stubGlobal(
            'fetch',
            vi.fn(async (input: RequestInfo | URL) => {
                if (String(input) === '/api/characters/import-card') {
                    imports += 1;
                    return new Response(
                        JSON.stringify({
                            card: { data: { name: 'Carded', description: 'From a card.' } },
                            thumbnailUrl: null
                        }),
                        { status: 201 }
                    );
                }
                return new Response(JSON.stringify({ jobs: [], assets: [] }), { status: 200 });
            })
        );
        await renderApp(<ModernApp user={user} />);
        await userEvent.click(screen.getAllByRole('button', { name: /Characters/i })[0]);
        const input = document.querySelector<HTMLInputElement>('input[type="file"]')!;
        const card = new File(['{}'], 'card.json', { type: 'application/json' });

        await userEvent.upload(input, card);
        await screen.findByRole('heading', { name: 'Carded' });
        await userEvent.upload(input, card);
        await waitFor(() => expect(imports).toBe(2));
        await waitFor(() =>
            expect(screen.getAllByRole('heading', { name: 'Carded' })).toHaveLength(2)
        );
    });
    describe('chat conversation', () => {
        function seedChat(messages: any[], extra: Record<string, unknown> = {}) {
            localStorage.setItem(
                'erochat_data_user_42',
                JSON.stringify({
                    settings: { openrouterKey: 'sk-test', openrouterModel: 'test/model' },
                    characters: [
                        {
                            id: 'nova',
                            name: 'Nova',
                            avatar: 'N',
                            systemPrompt: 'You are Nova.',
                            messages,
                            ...extra
                        }
                    ],
                    currentCharacterId: 'nova',
                    currentView: 'chat'
                })
            );
        }
        const stream = () => document.querySelector<HTMLElement>('.m-chat__stream')!;

        it('collapses messages that were archived into memory', async () => {
            seedChat([
                {
                    id: 'old',
                    role: 'user',
                    content: 'An old line.',
                    archivedFromModelContext: true
                },
                { id: 'new', role: 'assistant', content: 'A recent reply.' }
            ]);
            await renderApp(<ModernApp user={user} />);
            expect(within(stream()).getByText('A recent reply.')).toBeInTheDocument();
            expect(within(stream()).queryByText('An old line.')).not.toBeInTheDocument();
            await userEvent.click(
                screen.getByRole('button', { name: /1 earlier message is summarized in memory/ })
            );
            expect(within(stream()).getByText('An old line.')).toBeInTheDocument();
        });

        it('starts an empty chat with the character greeting', async () => {
            seedChat([], { greeting: 'Hello from Nova.' });
            await renderApp(<ModernApp user={user} />);
            await userEvent.click(screen.getByRole('button', { name: 'Start with greeting' }));
            expect(within(stream()).getByText('Hello from Nova.')).toBeInTheDocument();
            expect(
                screen.queryByRole('button', { name: 'Start with greeting' })
            ).not.toBeInTheDocument();
        });

        function mockPendingReply() {
            let resolve!: (response: Response) => void;
            let signal: AbortSignal | undefined;
            const fallback = globalThis.fetch;
            vi.stubGlobal('fetch', (input: RequestInfo | URL, init?: RequestInit) => {
                if (!String(input).includes('openrouter.ai')) return fallback(input, init);
                signal = init?.signal as AbortSignal;
                return new Promise<Response>((done, reject) => {
                    resolve = done;
                    signal?.addEventListener('abort', () =>
                        reject(new DOMException('Stopped', 'AbortError'))
                    );
                });
            });
            return {
                finish: (response: Response) => act(async () => resolve(response)),
                signal: () => signal
            };
        }

        it('preserves the next draft and isolates drafts when switching conversations', async () => {
            seedChat([]);
            const state = JSON.parse(localStorage.getItem('erochat_data_user_42')!);
            state.characters.push({ id: 'other', name: 'Other', messages: [] });
            localStorage.setItem('erochat_data_user_42', JSON.stringify(state));
            const reply = mockPendingReply();
            await renderApp(<ModernApp user={user} />);
            const input = screen.getByRole('textbox', { name: 'Message' });
            await userEvent.type(input, 'First message');
            await userEvent.click(screen.getByRole('button', { name: 'Send' }));
            expect(input).toHaveValue('');
            await userEvent.type(input, 'Next draft');
            await userEvent.click(screen.getByRole('button', { name: 'Chat with Other' }));
            expect(input).toHaveValue('');
            await userEvent.type(input, 'Another conversation draft');
            await reply.finish(
                new Response(
                    JSON.stringify({
                        choices: [{ message: { content: 'Finished reply.' } }]
                    })
                )
            );
            expect(input).toHaveValue('Another conversation draft');
            await userEvent.click(screen.getByRole('button', { name: 'Chat with Nova' }));
            expect(input).toHaveValue('Next draft');
            expect(within(stream()).getByText('Finished reply.')).toBeInTheDocument();
        });

        it('does not apply a draft upgrade over text typed while it was running', async () => {
            seedChat([]);
            const reply = mockPendingReply();
            await renderApp(<ModernApp user={user} />);
            const input = screen.getByRole('textbox', { name: 'Message' });
            await userEvent.type(input, 'First draft');
            await userEvent.click(screen.getByRole('button', { name: 'Message tools' }));
            await userEvent.click(screen.getByRole('menuitem', { name: /Polish/ }));
            await userEvent.type(input, ' and more');

            await reply.finish(
                new Response(JSON.stringify({ choices: [{ message: { content: 'Polished.' } }] }))
            );
            expect(input).toHaveValue('First draft and more');
            expect(await screen.findByText(/upgrade was not applied/)).toBeInTheDocument();
        });

        it('clears the conversation together with its memories', async () => {
            seedChat([{ id: 'u1', role: 'user', content: 'Remember me.' }], {
                memorySnapshots: [{ id: 'm1', finalText: 'They met at dawn.', createdAt: '2026' }]
            });
            vi.spyOn(window, 'confirm').mockReturnValue(true);
            await renderApp(<ModernApp user={user} />);
            const toggle = document.querySelector<HTMLButtonElement>(
                '.m-chat__head [aria-pressed]'
            )!;
            if (toggle.getAttribute('aria-pressed') !== 'true') await userEvent.click(toggle);
            await userEvent.click(screen.getByRole('button', { name: 'Clear chat' }));

            await waitFor(() =>
                expect(savedState.characters[0]).toMatchObject({
                    messages: [],
                    memorySnapshots: []
                })
            );
        });

        it('edits a message but will not save it empty', async () => {
            seedChat([{ id: 'a1', role: 'assistant', content: 'Original text.' }]);
            await renderApp(<ModernApp user={user} />);
            await userEvent.click(screen.getByRole('button', { name: 'Edit message' }));
            const dialog = screen.getByRole('dialog', { name: 'Edit assistant message' });
            const field = within(dialog).getByRole('textbox', { name: 'Message content' });
            const save = within(dialog).getByRole('button', { name: /Save changes/ });

            await userEvent.clear(field);
            await userEvent.type(field, '   ');
            expect(save).toBeDisabled();
            await userEvent.clear(field);
            await userEvent.type(field, 'Revised text.');
            await userEvent.click(save);
            expect(within(stream()).getByText('Revised text.')).toBeInTheDocument();
        });

        it('keeps an unsent draft while visiting another view', async () => {
            seedChat([]);
            await renderApp(<ModernApp user={user} />);
            await userEvent.type(screen.getByRole('textbox', { name: 'Message' }), 'Half typed');
            await userEvent.click(screen.getAllByRole('button', { name: 'Gallery' })[0]);
            await userEvent.click(screen.getAllByRole('button', { name: 'Chat' })[0]);
            expect(screen.getByRole('textbox', { name: 'Message' })).toHaveValue('Half typed');
        });

        it('keeps the draft when a draft upgrade comes back empty', async () => {
            seedChat([]);
            const reply = mockPendingReply();
            await renderApp(<ModernApp user={user} />);
            const input = screen.getByRole('textbox', { name: 'Message' });
            await userEvent.type(input, 'My draft');
            await userEvent.click(screen.getByRole('button', { name: 'Message tools' }));
            await userEvent.click(screen.getByRole('menuitem', { name: /Polish/ }));

            await reply.finish(
                new Response(JSON.stringify({ choices: [{ message: { content: '  ' } }] }))
            );
            expect(await screen.findByText('The model returned an empty response.')).toBeVisible();
            expect(input).toHaveValue('My draft');
        });

        it('does not show suggestions requested for one conversation in another', async () => {
            localStorage.setItem(
                'erochat_data_user_42',
                JSON.stringify({
                    settings: { openrouterKey: 'sk-test', openrouterModel: 'test/model' },
                    characters: [
                        {
                            id: 'nova',
                            name: 'Nova',
                            avatar: 'N',
                            systemPrompt: 'You are Nova.',
                            messages: [{ id: 'u1', role: 'user', content: 'Hi.' }]
                        },
                        {
                            id: 'other',
                            name: 'Other',
                            avatar: 'O',
                            systemPrompt: 'You are Other.',
                            messages: []
                        }
                    ],
                    currentCharacterId: 'nova',
                    currentView: 'chat'
                })
            );
            const reply = mockPendingReply();
            await renderApp(<ModernApp user={user} />);
            await userEvent.click(screen.getByRole('button', { name: 'Message tools' }));
            await userEvent.click(screen.getByRole('menuitem', { name: /Suggest replies/ }));
            await userEvent.click(screen.getByRole('button', { name: 'Chat with Other' }));

            await reply.finish(
                new Response(
                    JSON.stringify({ choices: [{ message: { content: 'Tell me more.' } }] })
                )
            );
            // Let the late suggestion result settle before asserting it was dropped.
            await new Promise((resolve) => setTimeout(resolve, 50));
            expect(screen.queryByText('Tell me more.')).not.toBeInTheDocument();
        });

        it('keeps a memory summary with the chat it summarized', async () => {
            localStorage.setItem(
                'erochat_data_user_42',
                JSON.stringify({
                    settings: { openrouterKey: 'sk-test', openrouterModel: 'test/model' },
                    characters: [
                        {
                            id: 'nova',
                            name: 'Nova',
                            avatar: 'N',
                            systemPrompt: 'You are Nova.',
                            messages: [{ id: 'u1', role: 'user', content: 'Hi.' }]
                        },
                        {
                            id: 'other',
                            name: 'Other',
                            avatar: 'O',
                            systemPrompt: 'You are Other.',
                            messages: []
                        }
                    ],
                    currentCharacterId: 'nova',
                    currentView: 'chat'
                })
            );
            const summary = mockPendingReply();
            await renderApp(<ModernApp user={user} />);
            await userEvent.click(screen.getByRole('button', { name: 'Message tools' }));
            await userEvent.click(screen.getByRole('menuitem', { name: /Compress memory/ }));
            await userEvent.click(screen.getByRole('button', { name: 'Chat with Other' }));
            await summary.finish(
                new Response(
                    JSON.stringify({ choices: [{ message: { content: 'Nova memory.' } }] })
                )
            );
            await new Promise((resolve) => setTimeout(resolve, 50));
            expect(screen.queryByRole('button', { name: 'Accept' })).not.toBeInTheDocument();

            await userEvent.click(screen.getByRole('button', { name: 'Chat with Nova' }));
            await userEvent.click(await screen.findByRole('button', { name: 'Accept' }));
            await waitFor(() => {
                const [nova, other] = savedState.characters;
                expect(nova.memorySnapshots).toEqual([
                    expect.objectContaining({ finalText: 'Nova memory.', messageIds: ['u1'] })
                ]);
                expect(other.memorySnapshots || []).toEqual([]);
            });
        });

        it('disables memory review regeneration while a reply is streaming', async () => {
            seedChat([
                { id: 'u1', role: 'user', content: 'Hi there.' },
                { id: 'a1', role: 'assistant', content: 'Hello.' }
            ]);
            const summary = mockPendingReply();
            await renderApp(<ModernApp user={user} />);
            await userEvent.click(screen.getByRole('button', { name: 'Message tools' }));
            await userEvent.click(screen.getByRole('menuitem', { name: /Compress memory/ }));
            await summary.finish(
                new Response(JSON.stringify({ choices: [{ message: { content: 'Summary.' } }] }))
            );
            const review = (await screen.findByRole('button', { name: 'Accept' })).parentElement!;

            const reply = mockPendingReply();
            await userEvent.type(screen.getByRole('textbox', { name: 'Message' }), 'Next line');
            await userEvent.click(screen.getByRole('button', { name: 'Send' }));
            await waitFor(() =>
                expect(within(review).getByRole('button', { name: /Regenerate/ })).toBeDisabled()
            );
            await reply.finish(
                new Response(JSON.stringify({ choices: [{ message: { content: 'Done.' } }] }))
            );
        });

        it.each(['failure', 'stop'])(
            'keeps the original reply after regeneration %s',
            async (outcome) => {
                seedChat([
                    { id: 'u1', role: 'user', content: 'Say something.' },
                    { id: 'a1', role: 'assistant', content: 'Original reply.' }
                ]);
                const reply = mockPendingReply();
                await renderApp(<ModernApp user={user} />);
                await userEvent.click(screen.getByRole('button', { name: 'Regenerate' }));
                if (outcome === 'stop') {
                    await userEvent.click(screen.getByRole('button', { name: 'Stop reply' }));
                    expect(reply.signal()?.aborted).toBe(true);
                } else {
                    await reply.finish(
                        new Response(JSON.stringify({ error: { message: 'Unavailable' } }), {
                            status: 503
                        })
                    );
                }
                expect(await within(stream()).findByText('Original reply.')).toBeInTheDocument();
                expect(
                    screen.queryByRole('button', { name: 'Stop reply' })
                ).not.toBeInTheDocument();
            }
        );

        it('keeps the original reply in saved state while a regeneration is still streaming', async () => {
            seedChat([
                { id: 'u1', role: 'user', content: 'Say something.' },
                { id: 'a1', role: 'assistant', content: 'Original reply.' }
            ]);
            const reply = mockPendingReply();
            await renderApp(<ModernApp user={user} />);
            await userEvent.click(screen.getByRole('button', { name: 'Regenerate' }));

            // Autosave runs every 500 ms; wait across two ticks while the replacement is pending.
            await new Promise((resolve) => setTimeout(resolve, 1200));
            const saved = savedState.characters.find((item: any) => item.id === 'nova');
            expect(saved.messages.map((message: any) => message.id)).toEqual(['u1', 'a1']);

            await reply.finish(
                new Response(JSON.stringify({ error: { message: 'Unavailable' } }), {
                    status: 503
                })
            );
            expect(await within(stream()).findByText('Original reply.')).toBeInTheDocument();
        });

        it('keeps streamed text when stopped and prevents tools from replacing the active request', async () => {
            seedChat([]);
            const reply = mockPendingReply();
            await renderApp(<ModernApp user={user} />);
            await userEvent.type(screen.getByRole('textbox', { name: 'Message' }), 'Hello');
            await userEvent.click(screen.getByRole('button', { name: 'Send' }));
            let source!: ReadableStreamDefaultController<Uint8Array>;
            const body = new ReadableStream<Uint8Array>({
                start(controller) {
                    source = controller;
                }
            });
            reply
                .signal()
                ?.addEventListener('abort', () =>
                    source.error(new DOMException('Stopped', 'AbortError'))
                );
            await reply.finish(
                new Response(body, { headers: { 'content-type': 'text/event-stream' } })
            );
            await act(async () => {
                source.enqueue(
                    new TextEncoder().encode(
                        'data: {"choices":[{"delta":{"content":"Partial reply."}}]}\n\n'
                    )
                );
            });
            expect(await within(stream()).findByText('Partial reply.')).toBeInTheDocument();
            await userEvent.click(screen.getByRole('button', { name: 'Message tools' }));
            expect(screen.getByRole('menuitem', { name: /Suggest replies/ })).toBeDisabled();
            expect(screen.getByRole('menuitem', { name: /Compress memory/ })).toBeDisabled();
            await userEvent.keyboard('{Escape}');
            await userEvent.click(screen.getByRole('button', { name: 'Stop reply' }));
            expect(within(stream()).getByText('Partial reply.')).toBeInTheDocument();
            expect(screen.queryByRole('button', { name: 'Stop reply' })).not.toBeInTheDocument();
            expect(document.querySelector('[aria-busy="true"]')).not.toBeInTheDocument();
        });

        it('regenerates the last reply to the latest user message', async () => {
            seedChat([
                { id: 'u1', role: 'user', content: 'Say something.' },
                { id: 'a1', role: 'assistant', content: 'First attempt.' }
            ]);
            const chatBodies: any[] = [];
            vi.stubGlobal(
                'fetch',
                vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
                    const url = String(input);
                    if (url.includes('openrouter.ai')) {
                        chatBodies.push(JSON.parse(String(init?.body)));
                        return new Response(
                            JSON.stringify({
                                choices: [{ message: { content: 'Second attempt.' } }]
                            })
                        );
                    }
                    if (url.includes('/api/generator/jobs')) {
                        return new Response(JSON.stringify({ jobs: [] }));
                    }
                    if (url.includes('/api/generator/assets')) {
                        return new Response(JSON.stringify({ assets: [] }));
                    }
                    return new Response(JSON.stringify({}));
                })
            );
            await renderApp(<ModernApp user={user} />);
            await userEvent.click(screen.getByRole('button', { name: 'Regenerate' }));
            expect(await within(stream()).findByText('Second attempt.')).toBeInTheDocument();
            expect(within(stream()).queryByText('First attempt.')).not.toBeInTheDocument();
            expect(within(stream()).getByText('Say something.')).toBeInTheDocument();
            const sent = chatBodies[0].messages.map((message: any) => message.content).join('\n');
            expect(sent).toContain('Say something.');
            expect(sent).not.toContain('First attempt.');
        });

        it('continues the last reply in place without saving the instruction', async () => {
            seedChat([
                { id: 'u1', role: 'user', content: 'Open the door.' },
                { id: 'a1', role: 'assistant', content: 'The door creaks' }
            ]);
            const chatBodies: any[] = [];
            let fail = false;
            vi.stubGlobal(
                'fetch',
                vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
                    const url = String(input);
                    if (url.includes('openrouter.ai')) {
                        chatBodies.push(JSON.parse(String(init?.body)));
                        if (fail) {
                            return new Response(JSON.stringify({ error: { message: 'Down.' } }), {
                                status: 500
                            });
                        }
                        return new Response(
                            JSON.stringify({ choices: [{ message: { content: 'open slowly.' } }] })
                        );
                    }
                    if (url.includes('/api/generator/jobs')) {
                        return new Response(JSON.stringify({ jobs: [] }));
                    }
                    if (url.includes('/api/generator/assets')) {
                        return new Response(JSON.stringify({ assets: [] }));
                    }
                    return new Response(JSON.stringify({}));
                })
            );
            await renderApp(<ModernApp user={user} />);
            await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
            expect(
                await within(stream()).findByText('The door creaks open slowly.')
            ).toBeInTheDocument();
            const sent = chatBodies[0].messages.map((message: any) => message.content);
            expect(sent.at(-2)).toBe('The door creaks');
            expect(sent.at(-1)).toMatch(/^\[Continue your last reply/);
            expect(
                within(stream()).queryByText(/Continue your last reply/)
            ).not.toBeInTheDocument();

            fail = true;
            await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
            await waitFor(() => expect(chatBodies).toHaveLength(2));
            expect(
                await within(stream()).findByText('The door creaks open slowly.')
            ).toBeInTheDocument();
            await waitFor(() =>
                expect(screen.getByRole('button', { name: 'Continue' })).toBeInTheDocument()
            );
        });

        it('keeps earlier replies as versions the user can page back to', async () => {
            seedChat([
                { id: 'u1', role: 'user', content: 'Say something.' },
                { id: 'a1', role: 'assistant', content: 'First attempt.' }
            ]);
            const chatBodies: any[] = [];
            vi.stubGlobal(
                'fetch',
                vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
                    const url = String(input);
                    if (url.includes('openrouter.ai')) {
                        chatBodies.push(JSON.parse(String(init?.body)));
                        return new Response(
                            JSON.stringify({
                                choices: [{ message: { content: 'Second attempt.' } }]
                            })
                        );
                    }
                    if (url.includes('/api/generator/jobs')) {
                        return new Response(JSON.stringify({ jobs: [] }));
                    }
                    if (url.includes('/api/generator/assets')) {
                        return new Response(JSON.stringify({ assets: [] }));
                    }
                    return new Response(JSON.stringify({}));
                })
            );
            await renderApp(<ModernApp user={user} />);
            expect(screen.queryByLabelText('Reply version')).not.toBeInTheDocument();
            await userEvent.click(screen.getByRole('button', { name: 'Regenerate' }));
            expect(await within(stream()).findByText('Second attempt.')).toBeInTheDocument();
            expect(screen.getByLabelText('Reply version')).toHaveTextContent('2/2');
            expect(screen.getByRole('button', { name: 'Next version' })).toBeDisabled();

            await userEvent.click(screen.getByRole('button', { name: 'Previous version' }));
            expect(within(stream()).getByText('First attempt.')).toBeInTheDocument();
            expect(within(stream()).queryByText('Second attempt.')).not.toBeInTheDocument();
            expect(screen.getByLabelText('Reply version')).toHaveTextContent('1/2');

            await userEvent.click(screen.getByRole('button', { name: 'Regenerate' }));
            expect(await screen.findByText('3/3')).toBeInTheDocument();
            const sent = chatBodies[1].messages.map((message: any) => message.content).join('\n');
            expect(sent).not.toContain('First attempt.');
            expect(sent).not.toContain('Second attempt.');
        });
    });
});
