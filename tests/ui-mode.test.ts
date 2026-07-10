import { beforeEach, describe, expect, it } from 'vitest';
import {
    getUiModeStorageKey,
    normalizeUiMode,
    resolveUiMode,
    setUiMode
} from '../src/client/ui-mode.js';

describe('UI mode preference', () => {
    beforeEach(() => localStorage.clear());

    it('defaults missing and invalid values to modern', () => {
        expect(resolveUiMode(7)).toBe('modern');
        localStorage.setItem(getUiModeStorageKey(7), 'unknown');
        expect(resolveUiMode(7)).toBe('modern');
        expect(normalizeUiMode(null)).toBe('modern');
    });

    it('persists independently for each user', () => {
        setUiMode(7, 'legacy');
        setUiMode(8, 'modern');
        expect(resolveUiMode(7)).toBe('legacy');
        expect(resolveUiMode(8)).toBe('modern');
    });
});
