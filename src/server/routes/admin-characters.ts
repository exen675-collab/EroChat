import type { Express } from 'express';
import { requireApiAuth, createAdminMiddleware } from '../middleware/auth';
import type { Database } from '../database';
import {
    buildCharacterGenerationMessages,
    normalizeGeneratedCharacterDraft,
    parseGeneratedCharacterDraft
} from '../../character-generation';
import {
    OPENROUTER_CHAT_COMPLETIONS_URL,
    ADMIN_CHARACTER_GENERATION_TIMEOUT_MS,
    ADMIN_CHARACTER_REFERENCE_LIMIT,
    ADMIN_CHARACTER_BRIEF_MAX_LENGTH
} from '../config';
import {
    normalizeAdminCharacterReferenceIds,
    mapCharacterGenerationReference,
    mapPublicCharacterRow
} from '../characters';
import {
    getOpenRouterMessageText,
    readOpenRouterPayload,
    openRouterErrorMessage
} from '../services/openrouter';
import { generateId } from '../utils';

export function registerAdminCharacterRoutes(app: Express, db: Database) {
    const { run, get, all } = db;
    const requireAdmin = createAdminMiddleware(db);
    app.post('/api/admin/characters/generate', requireApiAuth, requireAdmin, async (req, res) => {
        const rawApiKey = req.body?.apiKey;
        const rawModel = req.body?.model;
        const rawBrief = req.body?.brief;
        const apiKey = typeof rawApiKey === 'string' ? rawApiKey.trim() : '';
        const model = typeof rawModel === 'string' ? rawModel.trim() : '';
        const brief = typeof rawBrief === 'string' ? rawBrief.trim() : '';
        const referenceCharacterIds = normalizeAdminCharacterReferenceIds(
            req.body?.referenceCharacterIds ?? []
        );

        if (!apiKey || apiKey.length > 4096) {
            res.status(400).json({ error: 'A valid OpenRouter API key is required.' });
            return;
        }
        if (!model || model.length > 300) {
            res.status(400).json({ error: 'An OpenRouter model is required.' });
            return;
        }
        if (rawBrief != null && typeof rawBrief !== 'string') {
            res.status(400).json({ error: 'The creative brief must be text.' });
            return;
        }
        if (brief.length > ADMIN_CHARACTER_BRIEF_MAX_LENGTH) {
            res.status(400).json({
                error: `The creative brief must be ${ADMIN_CHARACTER_BRIEF_MAX_LENGTH} characters or fewer.`
            });
            return;
        }
        if (!referenceCharacterIds) {
            res.status(400).json({
                error: `Reference character IDs must be a list of at most ${ADMIN_CHARACTER_REFERENCE_LIMIT} positive integers.`
            });
            return;
        }

        let references = [];
        try {
            if (referenceCharacterIds.length > 0) {
                const placeholders = referenceCharacterIds.map(() => '?').join(', ');
                const rows = await all(
                    `SELECT * FROM public_characters WHERE id IN (${placeholders})`,
                    referenceCharacterIds
                );
                const rowsById = new Map(rows.map((row) => [Number(row.id), row]));
                const missingIds = referenceCharacterIds.filter((id) => !rowsById.has(id));
                if (missingIds.length > 0) {
                    res.status(400).json({
                        error: 'One or more selected reference characters no longer exist.'
                    });
                    return;
                }
                references = referenceCharacterIds.map((id) =>
                    mapCharacterGenerationReference(rowsById.get(id))
                );
            }
        } catch (error) {
            console.error('Failed to load character generation references:', error);
            res.status(500).json({ error: 'Failed to load reference characters.' });
            return;
        }

        let messages;
        try {
            messages = buildCharacterGenerationMessages({ references, brief });
        } catch (error) {
            res.status(400).json({
                error: error?.message || 'Invalid character generation input.'
            });
            return;
        }

        const abortController = new AbortController();
        const timeout = setTimeout(
            () => abortController.abort(),
            ADMIN_CHARACTER_GENERATION_TIMEOUT_MS
        );

        try {
            const response = await fetch(OPENROUTER_CHAT_COMPLETIONS_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${apiKey}`,
                    'X-Title': 'Wink'
                },
                body: JSON.stringify({
                    model,
                    messages,
                    temperature: 0.85,
                    max_tokens: 6000,
                    stream: false
                }),
                signal: abortController.signal
            });
            const payload = await readOpenRouterPayload(response);

            if (!response.ok) {
                const status = response.status === 429 ? 429 : 502;
                res.status(status).json({ error: openRouterErrorMessage(response.status) });
                return;
            }

            const content = getOpenRouterMessageText(payload);
            if (!content) {
                res.status(502).json({ error: 'OpenRouter returned an empty character draft.' });
                return;
            }

            try {
                const draft = parseGeneratedCharacterDraft(content);
                res.json({ draft });
            } catch (error) {
                res.status(502).json({
                    error:
                        error?.message ||
                        'The selected model returned a malformed character draft. Try again or choose another model.'
                });
            }
        } catch (error) {
            if (error?.name === 'AbortError') {
                res.status(504).json({ error: 'OpenRouter character generation timed out.' });
                return;
            }
            console.error('OpenRouter character generation failed:', error?.message || error);
            res.status(502).json({ error: 'Could not reach OpenRouter.' });
        } finally {
            clearTimeout(timeout);
        }
    });

    app.post('/api/admin/characters/publish', requireApiAuth, requireAdmin, async (req, res) => {
        let draft;
        try {
            draft = normalizeGeneratedCharacterDraft(req.body?.draft, {
                requireComplete: false
            });
        } catch (error) {
            res.status(400).json({
                error: error?.message || 'The generated character draft is invalid.'
            });
            return;
        }

        const userId = req.session.userId;
        const sourceCharacterId = `ai-${generateId()}`;

        try {
            const result = await run(
                `
          INSERT INTO public_characters (
            user_id, source_character_id, name, avatar, thumbnail, description, appearance,
            background, greeting, system_prompt, context_message_count
          ) VALUES (?, ?, ?, ?, '', ?, ?, ?, ?, ?, ?)
        `,
                [
                    userId,
                    sourceCharacterId,
                    draft.name,
                    draft.avatar,
                    draft.description,
                    draft.appearance,
                    draft.background,
                    draft.greeting,
                    draft.systemPrompt,
                    draft.contextMessageCount
                ]
            );
            const row = await get(
                `
          SELECT c.*, u.username AS creator_username
          FROM public_characters c
          JOIN users u ON u.id = c.user_id
          WHERE c.id = ?
        `,
                [result.lastID]
            );
            res.status(201).json({ character: mapPublicCharacterRow(row, userId) });
        } catch (error) {
            console.error('Failed to publish generated character:', error);
            res.status(500).json({ error: 'Failed to publish the generated character.' });
        }
    });
}
