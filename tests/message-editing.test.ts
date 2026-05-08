// @ts-nocheck
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('assistant message editing', () => {
    let state;
    let messages;
    let ui;

    beforeEach(async () => {
        vi.resetModules();
        document.body.innerHTML = `
            <div id="chatContainer"></div>
            <div id="settingsPanel" class="-translate-x-full"></div>
            <div id="advancedSettingsModal" class="hidden"></div>
            <div id="requestPreviewModal" class="hidden"></div>
            <div id="editMessageModal" class="hidden"></div>
            <textarea id="editMessageTextarea"></textarea>
            <button id="saveEditMessageBtn" type="button"></button>
            <button id="cancelEditMessageBtn" type="button"></button>
            <button id="closeEditMessageBtn" type="button"></button>
            <textarea id="messageInput"></textarea>
            <div id="generatorView" class="hidden"></div>
            <div id="galleryView" class="hidden"></div>
            <div id="chatView"></div>
            <div id="chatSettingsPane"></div>
            <div id="generatorSettingsPane" class="hidden"></div>
            <div id="currentCharacterDisplay"></div>
            <span id="currentCharacterName"></span>
            <span id="welcomeAvatar"></span>
            <span id="typingAvatar"></span>
            <div id="welcomeMessage"></div>
            <div id="charactersList"></div>
            <div id="charactersViewGrid"></div>
            <input id="systemPrompt" />
            <input id="contextMessageCount" />
            <div id="memoryPanel"></div>
            <div id="currentViewDescription"></div>
            <button id="navChatBtn" type="button"></button>
            <button id="navGeneratorBtn" type="button"></button>
            <button id="navGalleryBtn" type="button"></button>
            <select id="galleryCharacterFilter"></select>
            <select id="gallerySourceFilter"></select>
            <select id="galleryThumbnailCharacter"></select>
            <div id="galleryGrid"></div>
            <div id="connectionStatus"><span></span><span></span></div>
        `;

        ({ state } = await import('../src/client/state.ts'));
        messages = await import('../src/client/messages.ts');
        ui = await import('../src/client/ui.ts');

        state.currentCharacterId = 'default';
        state.characters = [
            {
                id: 'default',
                name: 'Test Character',
                avatar: 'A',
                systemPrompt: 'Stay in character.',
                messages: []
            }
        ];
        state.messages = [];
        state.galleryImages = [];
        state.generatorAssets = [];
        state.settings.enableImageGeneration = false;
        state.settings.contextMessageCount = 20;

        vi.stubGlobal('localStorage', {
            getItem: vi.fn(() => null),
            setItem: vi.fn(),
            removeItem: vi.fn()
        });
    });

    it('renders edit controls only for assistant messages and shows the edited badge', async () => {
        messages.addUserMessageToUI('User content', 'user-1');
        messages.addAIMessageToUI(
            'Assistant content',
            null,
            'assistant-1',
            null,
            '2026-04-05T20:00:00.000Z'
        );

        expect(document.querySelector('#user-1 .edit-message-btn')).toBeNull();
        expect(document.querySelector('#assistant-1 .edit-message-btn')).not.toBeNull();
        expect(document.querySelector('#assistant-1 .message-edited-badge')?.textContent).toContain(
            'Edited'
        );
    });

    it('places text actions under the text and image actions under the image', async () => {
        messages.addAIMessageToUI(
            'Assistant content',
            'data:image/png;base64,abc',
            'assistant-1',
            null,
            '2026-04-05T20:00:00.000Z'
        );

        const message = document.querySelector('#assistant-1');
        const textColumn = message?.querySelector('.chat-media-message');
        const mediaColumn = message?.querySelector('.chat-media-wrap');

        expect(textColumn?.querySelector('.chat-text-actions .edit-message-btn')).not.toBeNull();
        expect(textColumn?.querySelector('.chat-text-actions .branch-chat-btn')).not.toBeNull();
        expect(textColumn?.querySelector('.chat-text-actions .remove-message-btn')).not.toBeNull();
        expect(
            textColumn?.querySelector('.chat-text-actions .message-edited-badge')
        ).not.toBeNull();
        expect(textColumn?.querySelector('.regenerate-image-btn')).toBeNull();
        expect(
            mediaColumn?.querySelector('.chat-media-actions .regenerate-image-btn')
        ).not.toBeNull();
        expect(mediaColumn?.querySelector('.edit-message-btn')).toBeNull();
        expect(mediaColumn?.querySelector('.branch-chat-btn')).toBeNull();
        expect(mediaColumn?.querySelector('.remove-message-btn')).toBeNull();
    });

    it('branches an assistant message into a copied character at that point', async () => {
        const characters = await import('../src/client/characters.ts');
        state.currentCharacterId = 'char-a';
        state.characters = [
            {
                id: 'char-a',
                name: 'Alicia',
                avatar: 'A',
                systemPrompt: 'Stay in character.',
                description: 'Original character',
                messages: [],
                memorySnapshots: [{ finalText: 'They met at dusk.' }],
                contextMessageCount: 40
            }
        ];
        state.messages = [
            { id: 'user-1', role: 'user', content: 'Hello' },
            {
                id: 'assistant-1',
                role: 'assistant',
                content: 'Hi',
                imageUrl: '/app/media/a.png',
                videoUrl: null
            },
            { id: 'user-2', role: 'user', content: 'Continue' },
            { id: 'assistant-2', role: 'assistant', content: 'Later' }
        ];
        state.galleryImages = [
            {
                id: 'gallery-1',
                imageUrl: '/app/media/a.png',
                characterId: 'char-a',
                characterName: 'Alicia',
                characterAvatar: 'A',
                source: 'chat',
                messageId: 'assistant-1'
            },
            {
                id: 'gallery-2',
                imageUrl: '/app/media/b.png',
                characterId: 'char-a',
                characterName: 'Alicia',
                characterAvatar: 'A',
                source: 'chat',
                messageId: 'assistant-2'
            }
        ];

        const branch = characters.branchChatFromMessage('assistant-1');

        expect(branch).not.toBeNull();
        expect(branch?.id).not.toBe('char-a');
        expect(branch?.name).toBe('Alicia (Branch)');
        expect(branch?.messages.map((message) => message.id)).toEqual(['user-1', 'assistant-1']);
        expect(branch?.memorySnapshots).toEqual([{ finalText: 'They met at dusk.' }]);
        expect(state.currentCharacterId).toBe(branch?.id);
        expect(state.messages.map((message) => message.id)).toEqual(['user-1', 'assistant-1']);
        expect(state.galleryImages[0]).toMatchObject({
            imageUrl: '/app/media/a.png',
            characterId: branch?.id,
            characterName: 'Alicia (Branch)',
            messageId: 'assistant-1'
        });
        expect(
            state.galleryImages.some(
                (item) => item.characterId === branch?.id && item.messageId === 'assistant-2'
            )
        ).toBe(false);
    });

    it('keeps the message textarea scrollable without auto-growing', async () => {
        const textarea = document.getElementById('messageInput');
        Object.defineProperty(textarea, 'scrollHeight', {
            configurable: true,
            value: 220
        });
        textarea.style.height = '192px';

        ui.autoResizeTextarea();

        expect(textarea.style.height).toBe('192px');
        expect(textarea.style.overflowY).toBe('auto');
    });

    it('renders user message actions below the bubble inside the content column', async () => {
        messages.addUserMessageToUI('User content', 'user-1');

        const userActions = document.querySelector('#user-1 .message-actions');
        const userContentColumn = userActions?.parentElement;

        expect(userActions).not.toBeNull();
        expect(userActions?.className).toContain('flex-col');
        expect(userActions?.className).toContain('items-end');
        expect(userActions?.querySelector('.message-context-badge')).toBeNull();
        expect(userActions?.querySelector('.remove-message-btn')?.textContent).toContain(
            'Remove Message'
        );
        expect(userContentColumn?.className).toContain('flex-col');
        expect(userContentColumn?.contains(userActions)).toBe(true);
    });

    it('keeps every active raw message visually in context regardless of the limit', async () => {
        state.settings.contextMessageCount = 20;
        state.messages = [
            { id: 'user-1', role: 'user', content: 'Older user content' },
            ...Array.from({ length: 19 }, (_, index) => ({
                id: `assistant-${index + 1}`,
                role: 'assistant',
                content: `Recent assistant content ${index + 1}`,
                imageUrl: null,
                videoUrl: null
            })),
            { id: 'user-2', role: 'user', content: 'Recent user content' }
        ];

        messages.renderMessages();

        expect(document.querySelectorAll('.message-context-divider')).toHaveLength(0);
        expect(document.querySelector('#user-1')?.classList.contains('message-in-context')).toBe(
            true
        );
        expect(
            document.querySelector('#assistant-1')?.classList.contains('message-in-context')
        ).toBe(true);
        expect(document.querySelector('#user-2')?.classList.contains('message-in-context')).toBe(
            true
        );
    });

    it('renders one context boundary before active raw messages when older messages are archived', async () => {
        state.settings.contextMessageCount = 20;
        state.messages = [
            {
                id: 'user-1',
                role: 'user',
                content: 'Archived user content',
                archivedFromModelContext: true
            },
            { id: 'assistant-1', role: 'assistant', content: 'Active assistant content' },
            { id: 'user-2', role: 'user', content: 'Active user content' }
        ];

        messages.renderMessages();

        const divider = document.querySelector('.message-context-divider');

        expect(document.querySelectorAll('.message-context-divider')).toHaveLength(1);
        expect(divider?.textContent).toContain('In context');
        expect(divider?.textContent).toContain('Messages above are outside context');
        expect(
            document.querySelector('#user-1')?.classList.contains('message-outside-context')
        ).toBe(true);
        expect(
            document.querySelector('#user-1')?.classList.contains('message-archived-context')
        ).toBe(true);
        expect(
            document.querySelector('#assistant-1')?.classList.contains('message-in-context')
        ).toBe(true);
        expect(document.querySelector('#user-2')?.classList.contains('message-in-context')).toBe(
            true
        );
    });

    it('opens the modal with raw assistant content and saves edited content with metadata', async () => {
        state.messages = [
            {
                id: 'assistant-1',
                role: 'assistant',
                content: `Visible text\n\n---IMAGE_PROMPT START---\nprompt\n---IMAGE_PROMPT END---`,
                imageUrl: null,
                videoUrl: null
            }
        ];

        messages.editAssistantMessage('assistant-1');
        expect(document.getElementById('editMessageModal').classList.contains('hidden')).toBe(
            false
        );
        expect(document.getElementById('editMessageTextarea').value).toContain(
            '---IMAGE_PROMPT START---'
        );

        messages.saveEditedAssistantMessage(
            'assistant-1',
            'Updated visible text\n\n---IMAGE_PROMPT START---\nnew prompt\n---IMAGE_PROMPT END---'
        );
        ui.closeEditMessageModal();

        expect(state.messages[0].content).toContain('Updated visible text');
        expect(state.messages[0].content).toContain('new prompt');
        expect(typeof state.messages[0].editedAt).toBe('string');
    });

    it('rejects empty assistant edits', async () => {
        state.messages = [
            {
                id: 'assistant-1',
                role: 'assistant',
                content: 'Original',
                imageUrl: null,
                videoUrl: null
            }
        ];

        expect(() => messages.saveEditedAssistantMessage('assistant-1', '   ')).toThrow(
            'Assistant message content cannot be empty.'
        );
        expect(state.messages[0].content).toBe('Original');
        expect(state.messages[0].editedAt).toBeUndefined();
    });
});

describe('removeMessageFromContext', () => {
    let state;
    let messages;

    beforeEach(async () => {
        vi.resetModules();
        document.body.innerHTML = `
            <div id="chatContainer"></div>
            <div id="settingsPanel" class="-translate-x-full"></div>
            <div id="advancedSettingsModal" class="hidden"></div>
            <div id="requestPreviewModal" class="hidden"></div>
            <div id="editMessageModal" class="hidden"></div>
            <textarea id="editMessageTextarea"></textarea>
            <button id="saveEditMessageBtn" type="button"></button>
            <button id="cancelEditMessageBtn" type="button"></button>
            <button id="closeEditMessageBtn" type="button"></button>
            <div id="generatorView" class="hidden"></div>
            <div id="galleryView" class="hidden"></div>
            <div id="chatView"></div>
            <div id="chatSettingsPane"></div>
            <div id="generatorSettingsPane" class="hidden"></div>
            <div id="currentCharacterDisplay"></div>
            <div id="currentViewDescription"></div>
            <button id="navChatBtn" type="button"></button>
            <button id="navGeneratorBtn" type="button"></button>
            <button id="navGalleryBtn" type="button"></button>
            <select id="galleryCharacterFilter"></select>
            <select id="gallerySourceFilter"></select>
            <select id="galleryThumbnailCharacter"></select>
            <div id="galleryGrid"></div>
            <div id="connectionStatus"><span></span><span></span></div>
        `;

        ({ state } = await import('../src/client/state.ts'));
        messages = await import('../src/client/messages.ts');

        state.currentCharacterId = 'default';
        state.characters = [
            {
                id: 'default',
                name: 'Test Character',
                avatar: 'A',
                systemPrompt: '',
                messages: []
            }
        ];
        state.messages = [];
        state.galleryImages = [];
        state.generatorAssets = [];
        state.settings.enableImageGeneration = false;
        state.settings.contextMessageCount = 20;

        vi.stubGlobal('localStorage', {
            getItem: vi.fn(() => null),
            setItem: vi.fn(),
            removeItem: vi.fn()
        });
    });

    it('removes a message when the user confirms', async () => {
        state.messages = [
            { id: 'msg-1', role: 'user', content: 'Hello' },
            { id: 'msg-2', role: 'assistant', content: 'Hi there', imageUrl: null, videoUrl: null }
        ];

        const removal = messages.removeMessageFromContext('msg-1');
        const confirmButton = Array.from(document.querySelectorAll('button')).find(
            (button) => button.textContent === 'Remove'
        );

        expect(confirmButton).not.toBeUndefined();
        confirmButton.click();
        await removal;

        expect(state.messages).toHaveLength(1);
        expect(state.messages[0].id).toBe('msg-2');
    });

    it('does not remove any message when the user cancels', async () => {
        state.messages = [
            { id: 'msg-1', role: 'user', content: 'Hello' },
            { id: 'msg-2', role: 'assistant', content: 'Hi', imageUrl: null, videoUrl: null }
        ];

        const removal = messages.removeMessageFromContext('msg-1');
        const cancelButton = Array.from(document.querySelectorAll('button')).find(
            (button) => button.textContent === 'Cancel'
        );

        expect(cancelButton).not.toBeUndefined();
        cancelButton.click();
        await removal;

        expect(state.messages).toHaveLength(2);
    });

    it('is a no-op when the message id does not exist', () => {
        state.messages = [{ id: 'msg-1', role: 'user', content: 'Hello' }];

        messages.removeMessageFromContext('no-such-id');

        expect(state.messages).toHaveLength(1);
    });
});
