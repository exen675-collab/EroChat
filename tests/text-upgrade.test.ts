// @ts-nocheck
import { describe, expect, it } from 'vitest';

import {
    buildTextUpgradeMessages,
    TEXT_UPGRADE_MODEL
} from '../src/client/text-upgrade.ts';

describe('text upgrade helper', () => {
    it('pins the requested DeepSeek model id', () => {
        expect(TEXT_UPGRADE_MODEL).toBe('deepseek/deepseek-v4-flash');
    });

    it('uses the requested upgrade mode and the latest ten active messages', () => {
        const historyMessages = Array.from({ length: 12 }, (_, index) => ({
            role: index % 2 === 0 ? 'user' : 'assistant',
            content:
                index === 11
                    ? `Visible assistant reply

---IMAGE_PROMPT START---
hidden image prompt
---IMAGE_PROMPT END---`
                    : `Message ${index + 1}`,
            archivedFromModelContext: index === 0
        }));

        const messages = buildTextUpgradeMessages({
            draft: 'i has a idea',
            historyMessages,
            mode: 'full'
        });

        expect(messages[1].content).toContain('Upgrade level: full');
        expect(messages[1].content).not.toContain('Message 2');
        expect(messages[1].content).toContain('Message 3');
        expect(messages[1].content).toContain('Visible assistant reply');
        expect(messages[1].content).not.toContain('hidden image prompt');
        expect(messages[1].content).toContain('Draft to upgrade:\ni has a idea');
    });

    it('falls back to normal mode for unknown values', () => {
        const messages = buildTextUpgradeMessages({
            draft: 'hello',
            mode: 'unknown'
        });

        expect(messages[1].content).toContain('Upgrade level: normal');
    });
});
