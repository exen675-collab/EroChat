import { beforeEach, describe, expect, it } from 'vitest';
import {
    createModernDefaultState,
    getModernStorageKey,
    hydrateModernState,
    persistModernState
} from '../src/client/modern/storage.js';

describe('per-user app storage', () => {
    beforeEach(() => localStorage.clear());

    it('hydrates the existing per-user schema without discarding data', () => {
        localStorage.setItem(
            getModernStorageKey(3),
            JSON.stringify({
                settings: { openrouterModel: 'example/model' },
                characters: [
                    {
                        id: 'hero',
                        name: 'Hero',
                        systemPrompt: 'Stay in character.',
                        messages: [{ id: 'm1', role: 'user', content: 'Hello' }]
                    }
                ],
                currentCharacterId: 'hero',
                galleryImages: [{ id: 'g1', imageUrl: '/app/media/a.png' }],
                currentView: 'gallery'
            })
        );

        const hydrated = hydrateModernState(3);
        expect(hydrated.currentCharacterId).toBe('hero');
        expect(hydrated.characters[0].messages[0].content).toBe('Hello');
        expect(hydrated.settings.openrouterModel).toBe('example/model');
        expect(hydrated.galleryImages).toHaveLength(1);
        expect(hydrated.currentView).toBe('gallery');
        expect(hydrated.generatorPrefs.presets.length).toBeGreaterThan(0);
        expect(hydrated.generatorPrefs.defaultChatPresetId).toBe('chat-default');
    });

    it('writes the complete current state', () => {
        const state = createModernDefaultState();
        state.gallerySearchQuery = 'portrait';
        expect(persistModernState(4, state)).toBe(true);
        const stored = JSON.parse(localStorage.getItem(getModernStorageKey(4)) || '{}');
        expect(stored.settings).toBeDefined();
        expect(stored.characters).toBeDefined();
        expect(stored.generatorPrefs).toBeDefined();
        expect(stored.gallerySearchQuery).toBe('portrait');
    });

    it('migrates legacy chat and generator render settings into shared presets', () => {
        localStorage.setItem(
            getModernStorageKey(8),
            JSON.stringify({
                settings: {
                    imageProvider: 'openrouter',
                    openrouterImageModel: 'openai/gpt-image-1',
                    imgWidth: 1024,
                    imgHeight: 1024,
                    steps: 30
                },
                generatorPrefs: {
                    provider: 'comfy',
                    swarmWidth: 1280,
                    swarmHeight: 720,
                    swarmSteps: 22
                }
            })
        );

        const hydrated = hydrateModernState(8);
        const chatPreset = hydrated.generatorPrefs.presets.find(
            (preset) => preset.id === 'chat-default'
        );
        const manualPreset = hydrated.generatorPrefs.presets.find(
            (preset) => preset.id === 'manual-default'
        );

        expect(chatPreset).toMatchObject({
            provider: 'openrouter',
            providerModel: 'openai/gpt-image-1',
            width: 1024,
            height: 1024,
            steps: 30
        });
        expect(manualPreset).toMatchObject({
            provider: 'comfy',
            width: 1280,
            height: 720,
            steps: 22
        });
    });

    it('does not load unscoped data', () => {
        localStorage.setItem(
            'erochat_data',
            JSON.stringify({ characters: [{ id: 'old', name: 'Old data' }] })
        );

        const hydrated = hydrateModernState(5);

        expect(hydrated.currentCharacterId).toBe('default');
        expect(hydrated.characters[0].id).toBe('default');
    });
});
