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

        ({ state } = await import('../js/state.js'));
        messages = await import('../js/messages.js');
        ui = await import('../js/ui.js');

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

        ({ state } = await import('../js/state.js'));
        messages = await import('../js/messages.js');

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
        vi.stubGlobal('confirm', vi.fn(() => true));
    });

    it('removes a message when the user confirms', () => {
        state.messages = [
            { id: 'msg-1', role: 'user', content: 'Hello' },
            { id: 'msg-2', role: 'assistant', content: 'Hi there', imageUrl: null, videoUrl: null }
        ];

        messages.removeMessageFromContext('msg-1');

        expect(state.messages).toHaveLength(1);
        expect(state.messages[0].id).toBe('msg-2');
    });

    it('does not remove any message when the user cancels', () => {
        vi.stubGlobal('confirm', vi.fn(() => false));
        state.messages = [
            { id: 'msg-1', role: 'user', content: 'Hello' },
            { id: 'msg-2', role: 'assistant', content: 'Hi', imageUrl: null, videoUrl: null }
        ];

        messages.removeMessageFromContext('msg-1');

        expect(state.messages).toHaveLength(2);
    });

    it('is a no-op when the message id does not exist', () => {
        state.messages = [{ id: 'msg-1', role: 'user', content: 'Hello' }];

        messages.removeMessageFromContext('no-such-id');

        expect(state.messages).toHaveLength(1);
    });
});
