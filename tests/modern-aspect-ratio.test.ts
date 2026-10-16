import { describe, expect, it } from 'vitest';
import {
    ASPECT_RATIOS,
    dimensionsForAspectRatio,
    matchingAspectRatio
} from '../src/client/modern/media-presets.ts';

describe('generator aspect ratios', () => {
    it.each(ASPECT_RATIOS)('reshapes 1024x1024 to %s at about the same area', (ratio) => {
        const size = dimensionsForAspectRatio(1024, 1024, ratio);
        expect(size.width % 8).toBe(0);
        expect(size.height % 8).toBe(0);
        expect(Math.abs((size.width * size.height) / (1024 * 1024) - 1)).toBeLessThan(0.03);
        expect(matchingAspectRatio(size.width, size.height)).toBe(ratio);
    });

    it('keeps the area of a larger preset', () => {
        expect(dimensionsForAspectRatio(1536, 1536, '1:1')).toEqual({ width: 1536, height: 1536 });
        expect(dimensionsForAspectRatio(832, 1216, '9:16')).toEqual({ width: 752, height: 1344 });
    });

    it('reports a size that matches no listed ratio as custom', () => {
        expect(matchingAspectRatio(1000, 700)).toBe('auto');
        expect(matchingAspectRatio(0, 700)).toBe('auto');
    });
});
