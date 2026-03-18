import { describe, expect, it } from 'vitest';

import { defaultCharacter, defaultGeneratorPrefs, defaultSettings } from '../js/config.js';

describe('default config', () => {
    it('keeps the main app defaults stable', () => {
        expect(defaultSettings.textProvider).toBe('premium');
        expect(defaultSettings.imageProvider).toBe('swarm');
        expect(defaultSettings.enableImageGeneration).toBe(true);
        expect(defaultSettings.contextMessageCount).toBe(20);
    });

    it('keeps generator defaults stable', () => {
        expect(defaultGeneratorPrefs.mode).toBe('image_generate');
        expect(defaultGeneratorPrefs.provider).toBe('grok');
        expect(defaultGeneratorPrefs.batchCount).toBe(1);
        expect(defaultGeneratorPrefs.promptPresets).toEqual([]);
    });

    it('provides a default character with message history initialized', () => {
        expect(defaultCharacter.id).toBe('default');
        expect(defaultCharacter.isDefault).toBe(true);
        expect(defaultCharacter.messages).toEqual([]);
    });
});
