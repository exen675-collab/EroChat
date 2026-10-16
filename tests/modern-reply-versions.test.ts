import { describe, expect, it } from 'vitest';
import {
    greetingMessage,
    replyVersions,
    selectReplyVersion,
    succeedingVersion
} from '../src/client/modern/reply-versions.js';
import type { ModernMessage } from '../src/client/modern/types.js';

const reply = (content: string, extra: Partial<ModernMessage> = {}): ModernMessage => ({
    id: content,
    role: 'assistant',
    content,
    ...extra
});

describe('reply versions', () => {
    it('keeps every earlier version when a reply is regenerated', () => {
        const first = reply('First.', { imageUrl: '/app/media/first.png' });
        const second = { ...succeedingVersion(first, reply('')), content: 'Second.' };
        const third = { ...succeedingVersion(second, reply('')), content: 'Third.' };

        expect(replyVersions(third).map((version) => version.content)).toEqual([
            'First.',
            'Second.',
            'Third.'
        ]);
        expect(third.versionIndex).toBe(2);
        expect(replyVersions(third)[0].imageUrl).toBe('/app/media/first.png');
    });

    it('swaps in another version with its own scene image', () => {
        const current = {
            ...succeedingVersion(reply('First.', { imageUrl: '/app/media/first.png' }), reply('')),
            content: 'Second.',
            imageUrl: null
        };

        const earlier = selectReplyVersion(current, 0);
        expect(earlier).toMatchObject({
            content: 'First.',
            imageUrl: '/app/media/first.png',
            mediaStatus: 'completed',
            versionIndex: 0
        });
        expect(replyVersions(earlier).map((version) => version.content)).toEqual([
            'First.',
            'Second.'
        ]);
        expect(selectReplyVersion(earlier, 1)).toMatchObject({
            content: 'Second.',
            imageUrl: null,
            mediaStatus: null
        });
    });

    it('regenerating from an earlier version keeps the order and appends the new one', () => {
        const two = { ...succeedingVersion(reply('A'), reply('')), content: 'B' };
        const shownA = selectReplyVersion(two, 0);
        const next = { ...succeedingVersion(shownA, reply('')), content: 'C' };

        expect(replyVersions(next).map((version) => version.content)).toEqual(['A', 'B', 'C']);
    });

    it('ignores out-of-range selections and non-assistant predecessors', () => {
        const message = reply('Only.');
        expect(selectReplyVersion(message, 3)).toBe(message);
        expect(selectReplyVersion(message, 0)).toBe(message);
        const user: ModernMessage = { id: 'u', role: 'user', content: 'Hi' };
        expect(succeedingVersion(user, reply('New.')).otherVersions).toBeUndefined();
    });

    it('builds an opening message whose alternate greetings are later versions', () => {
        const message = greetingMessage('g', 'Hello.', ['Hi.', 'Hello.', 'Hi.', '']);
        expect(replyVersions(message).map((version) => version.content)).toEqual(['Hello.', 'Hi.']);
        expect(message.versionIndex).toBe(0);
        expect(greetingMessage('g', 'Hello.')).toEqual({
            id: 'g',
            role: 'assistant',
            content: 'Hello.'
        });
    });
});
