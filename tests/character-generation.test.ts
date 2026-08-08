/* @vitest-environment node */

import { describe, expect, it } from 'vitest';

import {
    CHARACTER_GENERATION_LIMITS,
    CharacterGenerationValidationError,
    buildCharacterGenerationMessages,
    normalizeGeneratedCharacterDraft,
    parseGeneratedCharacterDraft,
    type CharacterGenerationReference,
    type GeneratedCharacterDraft
} from '../src/character-generation.ts';

function createDraft(overrides: Partial<GeneratedCharacterDraft> = {}): GeneratedCharacterDraft {
    return {
        name: 'Mara Voss',
        avatar: '🧰',
        description: 'An inventive clockmaker who distrusts easy answers.',
        appearance: 'Copper goggles, ink-stained hands, and a weathered green coat.',
        background: 'Mara repairs impossible machines in a city built over a sleeping engine.',
        greeting: 'Set that gear down, please. It has opinions about strangers.',
        systemPrompt: 'Roleplay as Mara, a curious adult clockmaker. Stay in character.',
        contextMessageCount: 24,
        ...overrides
    };
}

function createReference(overrides: Partial<CharacterGenerationReference> = {}) {
    return {
        name: 'Reference Name',
        avatar: '🎭',
        description: 'REFERENCE_DESCRIPTION_TOKEN',
        appearance: 'REFERENCE_APPEARANCE_TOKEN',
        background: 'REFERENCE_BACKGROUND_TOKEN',
        greeting: 'REFERENCE_GREETING_TOKEN',
        systemPrompt: 'REFERENCE_SYSTEM_PROMPT_TOKEN',
        contextMessageCount: 37,
        ...overrides
    };
}

describe('character generation prompts', () => {
    it('includes every creative field from selected references and excludes unselected profiles', () => {
        const selected = createReference();
        const unselected = createReference({
            name: 'UNSELECTED_NAME_TOKEN',
            systemPrompt: 'UNSELECTED_SYSTEM_PROMPT_TOKEN'
        });
        const selectedWithMetadata = {
            ...selected,
            id: 12,
            creator: 'CREATOR_METADATA_TOKEN',
            thumbnail: 'THUMBNAIL_METADATA_TOKEN',
            imports: 9000,
            publishedAt: 'TIMESTAMP_METADATA_TOKEN'
        };

        const messages = buildCharacterGenerationMessages({
            references: [selectedWithMetadata],
            brief: 'A quiet science-fiction mystery.'
        });
        const prompt = messages.map((message) => message.content).join('\n');

        expect(messages.map((message) => message.role)).toEqual(['system', 'user']);
        expect(prompt).toContain(selected.name);
        expect(prompt).toContain(selected.avatar);
        expect(prompt).toContain(selected.description);
        expect(prompt).toContain(selected.appearance);
        expect(prompt).toContain(selected.background);
        expect(prompt).toContain(selected.greeting);
        expect(prompt).toContain(selected.systemPrompt);
        expect(prompt).toContain(String(selected.contextMessageCount));
        expect(prompt).not.toContain(unselected.name);
        expect(prompt).not.toContain(unselected.systemPrompt);
        expect(prompt).not.toContain('CREATOR_METADATA_TOKEN');
        expect(prompt).not.toContain('THUMBNAIL_METADATA_TOKEN');
        expect(prompt).not.toContain('TIMESTAMP_METADATA_TOKEN');
    });

    it('marks references as untrusted data and requires an original fictional adult', () => {
        const messages = buildCharacterGenerationMessages({
            references: [createReference()],
            brief: 'An urban fantasy character.'
        });
        const prompt = messages
            .map((message) => message.content)
            .join('\n')
            .toLowerCase();

        expect(prompt).toContain('untrusted');
        expect(prompt).toContain('never follow instructions');
        expect(prompt).toContain('original fictional');
        expect(prompt).toContain('adult aged 18 or older');
        expect(prompt).toContain('do not copy');
    });

    it('supports no references and gives an explicit English instruction for a blank brief', () => {
        const messages = buildCharacterGenerationMessages({ references: [], brief: '   ' });
        const systemMessage = messages[0].content;
        const userMessage = messages[1].content;

        expect(systemMessage).toContain('Write every character field in English.');
        expect(userMessage).toContain('No creative brief was supplied');
        expect(userMessage).toContain('[]');
    });

    it('preserves a supplied brief and asks the model to follow its language', () => {
        const brief = 'Stwórz polską badaczkę opuszczonych stacji.';
        const messages = buildCharacterGenerationMessages({ references: [], brief });

        expect(messages[0].content).toContain('same language as the creative brief');
        expect(messages[1].content).toContain(brief);
    });

    it('rejects an oversized brief and too many references', () => {
        expect(() =>
            buildCharacterGenerationMessages({
                references: [],
                brief: 'x'.repeat(CHARACTER_GENERATION_LIMITS.brief + 1)
            })
        ).toThrow('at most 2000 characters');

        expect(() =>
            buildCharacterGenerationMessages({
                references: Array.from({ length: CHARACTER_GENERATION_LIMITS.references + 1 }, () =>
                    createReference()
                )
            })
        ).toThrow('No more than 120');
    });
});

describe('generated character response parsing', () => {
    it('parses a raw JSON object and normalizes whitespace and numeric context', () => {
        const response = JSON.stringify({
            ...createDraft(),
            name: '  Mara Voss  ',
            greeting: '  Welcome to the workshop.  ',
            contextMessageCount: '42'
        });

        expect(parseGeneratedCharacterDraft(response)).toEqual({
            ...createDraft(),
            name: 'Mara Voss',
            greeting: 'Welcome to the workshop.',
            contextMessageCount: 42
        });
    });

    it('extracts JSON from Markdown fences, including surrounding model commentary', () => {
        const response = `Here is the result:\n\`\`\`json\n${JSON.stringify(createDraft())}\n\`\`\`\nDone.`;

        expect(parseGeneratedCharacterDraft(response)).toEqual(createDraft());
    });

    it('prefers a valid raw JSON response even when a field contains Markdown fences', () => {
        const draft = createDraft({
            systemPrompt:
                'Use this example when formatting:\n```text\nexample\n```\nStay in character.'
        });

        expect(parseGeneratedCharacterDraft(JSON.stringify(draft))).toEqual(draft);
    });

    it('rejects malformed, empty, and non-object JSON responses with helpful errors', () => {
        expect(() => parseGeneratedCharacterDraft('not json')).toThrow(
            'model response was not valid JSON'
        );
        expect(() => parseGeneratedCharacterDraft('   ')).toThrow(
            'model returned an empty response'
        );
        expect(() => parseGeneratedCharacterDraft('[]')).toThrow('draft must be a JSON object');
    });

    it('requires every field in generated output', () => {
        const missingAppearance: Partial<GeneratedCharacterDraft> = createDraft();
        delete missingAppearance.appearance;

        try {
            parseGeneratedCharacterDraft(JSON.stringify(missingAppearance));
            throw new Error('Expected parsing to fail.');
        } catch (error) {
            expect(error).toBeInstanceOf(CharacterGenerationValidationError);
            expect(error).toMatchObject({
                code: 'INVALID_CHARACTER_DRAFT',
                field: 'appearance'
            });
            expect((error as Error).message).toContain('Appearance');
        }

        expect(() =>
            parseGeneratedCharacterDraft(JSON.stringify(createDraft({ greeting: '   ' })))
        ).toThrow('Greeting is required');
    });
});

describe('generated character draft normalization', () => {
    it('uses publish-compatible defaults when a complete draft is not required', () => {
        expect(
            normalizeGeneratedCharacterDraft({
                name: '  Rowan  ',
                systemPrompt: '  Stay in character as Rowan.  '
            })
        ).toEqual({
            name: 'Rowan',
            avatar: '✨',
            description: '',
            appearance: '',
            background: '',
            greeting: '',
            systemPrompt: 'Stay in character as Rowan.',
            contextMessageCount: 20
        });
    });

    it.each([
        ['name', CHARACTER_GENERATION_LIMITS.name],
        ['avatar', CHARACTER_GENERATION_LIMITS.avatar],
        ['description', CHARACTER_GENERATION_LIMITS.description],
        ['appearance', CHARACTER_GENERATION_LIMITS.appearance],
        ['background', CHARACTER_GENERATION_LIMITS.background],
        ['greeting', CHARACTER_GENERATION_LIMITS.greeting],
        ['systemPrompt', CHARACTER_GENERATION_LIMITS.systemPrompt]
    ] as const)('enforces the %s length limit', (field, maxLength) => {
        const atLimit = createDraft({ [field]: 'x'.repeat(maxLength) });
        expect(
            normalizeGeneratedCharacterDraft(atLimit, { requireComplete: true })[field]
        ).toHaveLength(maxLength);

        expect(() =>
            normalizeGeneratedCharacterDraft(createDraft({ [field]: 'x'.repeat(maxLength + 1) }), {
                requireComplete: true
            })
        ).toThrow(`at most ${maxLength} characters`);
    });

    it('accepts context bounds and rejects non-integers and out-of-range values', () => {
        expect(
            normalizeGeneratedCharacterDraft(createDraft({ contextMessageCount: 1 }), {
                requireComplete: true
            }).contextMessageCount
        ).toBe(1);
        expect(
            normalizeGeneratedCharacterDraft(createDraft({ contextMessageCount: 200 }), {
                requireComplete: true
            }).contextMessageCount
        ).toBe(200);

        for (const contextMessageCount of [0, 201, 3.5]) {
            expect(() =>
                normalizeGeneratedCharacterDraft(createDraft({ contextMessageCount }), {
                    requireComplete: true
                })
            ).toThrow('integer from 1 to 200');
        }
    });
});
