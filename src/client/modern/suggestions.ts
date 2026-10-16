import { getAssistantVisibleText } from '../utils.js';
import type { ModernMessage } from './types.js';

const SUGGESTION_CONTEXT_MESSAGES = 8;

/**
 * The recent scene goes in as one transcript. Sent as chat turns ending on the character's reply,
 * many models would simply continue the roleplay instead of suggesting anything.
 */
export function buildSuggestionMessages(characterName: string, messages: ModernMessage[]) {
    const transcript = messages
        .filter((message) => !message.isStreaming && message.content.trim())
        .slice(-SUGGESTION_CONTEXT_MESSAGES)
        .map((message) =>
            message.role === 'user'
                ? `Me: ${message.content.trim()}`
                : `${characterName}: ${getAssistantVisibleText(message.content).trim()}`
        )
        .join('\n\n');
    return [
        {
            role: 'system',
            content:
                'You help a user decide what to say next in a roleplay chat. Suggest three short, distinct messages the user could send next, written in their voice. Return one suggestion per line with no numbering or commentary.'
        },
        {
            role: 'user',
            content: transcript
                ? `Recent scene with ${characterName}:\n\n${transcript}`
                : `The scene with ${characterName} has not started yet.`
        }
    ];
}

export function parseSuggestions(text: string): string[] {
    return text
        .split('\n')
        .map((line) =>
            line
                .trim()
                // List markers only: "1." or "-" goes, but a leading "3 more" stays.
                .replace(/^(?:[-*•]|\d+[.)])\s+/, '')
                .replace(/^(["“])(.*)["”]$/, '$2')
                .trim()
        )
        .filter(Boolean)
        .slice(0, 3);
}
