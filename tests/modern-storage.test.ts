import { beforeEach, describe, expect, it } from 'vitest';
import {
    createModernDefaultState,
    getModernStorageKey,
    hydrateModernState,
    persistModernState
} from '../src/client/modern/storage.js';

describe('modern and legacy storage compatibility', () => {
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
    });

    it('writes the same top-level persisted fields used by legacy mode', () => {
        const state = createModernDefaultState();
        state.gallerySearchQuery = 'portrait';
        expect(persistModernState(4, state)).toBe(true);
        const stored = JSON.parse(localStorage.getItem(getModernStorageKey(4)) || '{}');
        expect(stored.settings).toBeDefined();
        expect(stored.characters).toBeDefined();
        expect(stored.generatorPrefs).toBeDefined();
        expect(stored.gallerySearchQuery).toBe('portrait');
    });
});
