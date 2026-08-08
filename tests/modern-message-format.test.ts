import { describe, expect, it } from 'vitest';
import { parseNarrativeSegments } from '../src/client/modern/message-format.js';

describe('modern message formatting', () => {
    it('recognizes asterisk-delimited narration without changing regular text', () => {
        expect(parseNarrativeSegments('Hello *walks closer* there')).toEqual([
            { text: 'Hello ', narrative: false },
            { text: 'walks closer', narrative: true },
            { text: ' there', narrative: false }
        ]);
        expect(parseNarrativeSegments('An unmatched * stays visible')).toEqual([
            { text: 'An unmatched * stays visible', narrative: false }
        ]);
        expect(parseNarrativeSegments('**bold text**')).toEqual([
            { text: '**bold text**', narrative: false }
        ]);
    });
});
