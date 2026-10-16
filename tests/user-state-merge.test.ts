// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { mergeImportedState } from '../src/user-state';

describe('migration merge', () => {
    it('keeps saved records, recovers missing local ones, and lets saved values win conflicts', () => {
        const local = [
            { id: 'a', name: 'Local A', notes: 'only local' },
            { id: 'b', name: 'Local B' },
            { id: 'c', name: 'Only local C' }
        ];
        const saved = [
            { id: 'a', name: 'Saved A' },
            { id: 'b', name: 'Saved B', extra: true }
        ];

        expect(mergeImportedState(local, saved)).toEqual([
            { id: 'a', name: 'Saved A', notes: 'only local' },
            { id: 'b', name: 'Saved B', extra: true },
            { id: 'c', name: 'Only local C' }
        ]);
    });

    it('matches records without ids by content and does not duplicate them', () => {
        const local = [{ text: 'hello' }, { text: 'hello' }, { text: 'new' }];
        const saved = [{ text: 'hello' }];

        expect(mergeImportedState(local, saved)).toEqual([{ text: 'hello' }, { text: 'new' }]);
    });

    it('merges large payloads in linear time', () => {
        const size = 20000;
        const saved = Array.from({ length: size }, (_, index) => ({
            id: `saved-${index}`,
            value: index
        }));
        const local = Array.from({ length: size }, (_, index) => ({
            id: index % 2 === 0 ? `saved-${index}` : `local-${index}`,
            value: -index
        }));

        const started = performance.now();
        const merged = mergeImportedState(local, saved);
        const elapsed = performance.now() - started;

        expect(merged).toHaveLength(size + size / 2);
        expect(elapsed).toBeLessThan(1000);
    });
});
