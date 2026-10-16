import { describe, expect, it } from 'vitest';
import { buildSuggestionMessages, parseSuggestions } from '../src/client/modern/suggestions.js';
import type { ModernMessage } from '../src/client/modern/types.js';

describe('reply suggestions', () => {
    it('sends the recent scene as one labeled transcript, not as chat turns', () => {
        const messages: ModernMessage[] = Array.from({ length: 10 }, (_, index) => ({
            id: String(index),
            role: index % 2 ? 'assistant' : 'user',
            content: `Line ${index}`
        }));
        messages.push({ id: 's', role: 'assistant', content: 'Half', isStreaming: true });

        const request = buildSuggestionMessages('Nova', messages);
        expect(request.map((message) => message.role)).toEqual(['system', 'user']);
        expect(request[1].content).toContain('Recent scene with Nova:');
        expect(request[1].content).toContain('Me: Line 2');
        expect(request[1].content).toContain('Nova: Line 9');
        expect(request[1].content).not.toContain('Line 1\n');
        expect(request[1].content).not.toContain('Half');
    });

    it('strips list markers and quotes but keeps leading numbers in the text', () => {
        expect(
            parseSuggestions(
                '1. "Tell me more."\n- Lean closer\n\n3 more drinks, please.\n2) “Ask why.”\nExtra'
            )
        ).toEqual(['Tell me more.', 'Lean closer', '3 more drinks, please.']);
    });
});
