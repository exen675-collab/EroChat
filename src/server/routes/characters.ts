import type { Express } from 'express';
import { requireApiAuth } from '../middleware/auth';
import type { Database } from '../database';
import { parseCharacterCardImportFile } from '../../character-card-import';
import { upload } from '../middleware/upload';
import { MAX_UPLOADED_MEDIA_BYTES } from '../config';
import { storeMediaBuffer } from '../services/media';
import { limitedText, normalizePositiveInt } from '../utils';
import {
    PUBLIC_CHARACTER_SORTS,
    normalizePublicCharacterPayload,
    mapPublicCharacterRow
} from '../characters';

export function registerCharacterRoutes(app: Express, db: Database) {
    const { run, get, all } = db;
    app.post(
        '/api/characters/import-card',
        requireApiAuth,
        upload.single('file'),
        async (req, res) => {
            if (!req.file) {
                res.status(400).json({ error: 'A character card file is required.' });
                return;
            }

            try {
                const parsed = parseCharacterCardImportFile(req.file);
                let thumbnailUrl = null;

                if (parsed.thumbnailBuffer && parsed.thumbnailMimeType) {
                    const storedThumbnail = await storeMediaBuffer(
                        parsed.thumbnailBuffer,
                        parsed.thumbnailMimeType,
                        MAX_UPLOADED_MEDIA_BYTES
                    );
                    thumbnailUrl = storedThumbnail.url;
                }

                res.status(201).json({
                    card: parsed.card,
                    thumbnailUrl,
                    fileName: parsed.fileName,
                    warnings: parsed.warnings
                });
            } catch (error) {
                const statusCode = Number.isFinite(error?.statusCode) ? error.statusCode : 400;
                console.error('Failed to import character card:', error);
                res.status(statusCode).json({
                    error: error?.message || 'Failed to import character card.'
                });
            }
        }
    );

    app.get('/api/characters/browse', requireApiAuth, async (req, res) => {
        const userId = req.session.userId;
        const search = limitedText(req.query?.q, 100) || '';
        const requestedSort = limitedText(req.query?.sort, 20) || 'newest';
        const sort = PUBLIC_CHARACTER_SORTS.has(requestedSort) ? requestedSort : 'newest';
        const orderBy =
            sort === 'popular'
                ? 'c.import_count DESC, c.updated_at DESC'
                : sort === 'name'
                  ? 'c.name COLLATE NOCASE ASC, c.updated_at DESC'
                  : 'c.updated_at DESC';
        const params = [];
        let where = '';

        if (search) {
            // Searches match literally: % and _ in the query are not wildcards.
            where =
                "WHERE c.name LIKE ? ESCAPE '\\' OR c.description LIKE ? ESCAPE '\\' OR u.username LIKE ? ESCAPE '\\'";
            const pattern = `%${search.replace(/[\\%_]/g, '\\$&')}%`;
            params.push(pattern, pattern, pattern);
        }

        try {
            const rows = await all(
                `
      SELECT c.*, u.username AS creator_username
      FROM public_characters c
      JOIN users u ON u.id = c.user_id
      ${where}
      ORDER BY ${orderBy}
      LIMIT 120
    `,
                params
            );
            res.json({ characters: rows.map((row) => mapPublicCharacterRow(row, userId)) });
        } catch (error) {
            console.error('Failed to browse public characters:', error);
            res.status(500).json({ error: 'Failed to load public characters.' });
        }
    });

    app.post('/api/characters/publish', requireApiAuth, async (req, res) => {
        const userId = req.session.userId;
        const character = normalizePublicCharacterPayload(req.body?.character);
        if (!character) {
            res.status(400).json({
                error: 'Name, system prompt, and source character id are required.'
            });
            return;
        }

        try {
            const existing = await get(
                'SELECT id FROM public_characters WHERE user_id = ? AND source_character_id = ?',
                [userId, character.sourceCharacterId]
            );
            await run(
                `
        INSERT INTO public_characters (
          user_id, source_character_id, name, avatar, thumbnail, description, appearance,
          background, greeting, system_prompt, context_message_count
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(user_id, source_character_id) DO UPDATE SET
          name = excluded.name,
          avatar = excluded.avatar,
          thumbnail = excluded.thumbnail,
          description = excluded.description,
          appearance = excluded.appearance,
          background = excluded.background,
          greeting = excluded.greeting,
          system_prompt = excluded.system_prompt,
          context_message_count = excluded.context_message_count,
          updated_at = CURRENT_TIMESTAMP
      `,
                [
                    userId,
                    character.sourceCharacterId,
                    character.name,
                    character.avatar,
                    character.thumbnail,
                    character.description,
                    character.appearance,
                    character.background,
                    character.greeting,
                    character.systemPrompt,
                    character.contextMessageCount
                ]
            );
            const row = await get(
                `
        SELECT c.*, u.username AS creator_username
        FROM public_characters c
        JOIN users u ON u.id = c.user_id
        WHERE c.user_id = ? AND c.source_character_id = ?
      `,
                [userId, character.sourceCharacterId]
            );
            res.status(existing ? 200 : 201).json({
                character: mapPublicCharacterRow(row, userId)
            });
        } catch (error) {
            console.error('Failed to publish character:', error);
            res.status(500).json({ error: 'Failed to publish character.' });
        }
    });

    app.post('/api/characters/browse/:id/import', requireApiAuth, async (req, res) => {
        const userId = req.session.userId;
        const publicationId = normalizePositiveInt(req.params.id, 0, 0, Number.MAX_SAFE_INTEGER);
        if (!publicationId) {
            res.status(400).json({ error: 'Invalid public character id.' });
            return;
        }

        try {
            const row = await get(
                `
        SELECT c.*, u.username AS creator_username
        FROM public_characters c
        JOIN users u ON u.id = c.user_id
        WHERE c.id = ?
      `,
                [publicationId]
            );
            if (!row) {
                res.status(404).json({ error: 'Public character not found.' });
                return;
            }

            // Each person counts once, and the publisher's own imports do not count, so repeating a
            // request cannot inflate the popularity ranking.
            const claimed =
                row.user_id === userId
                    ? { changes: 0 }
                    : await run(
                          'INSERT OR IGNORE INTO public_character_imports (publication_id, user_id) VALUES (?, ?)',
                          [publicationId, userId]
                      );
            if (claimed.changes) {
                await run(
                    'UPDATE public_characters SET import_count = import_count + 1 WHERE id = ?',
                    [publicationId]
                );
                row.import_count = Number(row.import_count || 0) + 1;
            }
            res.json({ character: mapPublicCharacterRow(row, userId) });
        } catch (error) {
            console.error('Failed to import public character:', error);
            res.status(500).json({ error: 'Failed to import public character.' });
        }
    });

    app.delete('/api/characters/published/:id', requireApiAuth, async (req, res) => {
        const userId = req.session.userId;
        const publicationId = normalizePositiveInt(req.params.id, 0, 0, Number.MAX_SAFE_INTEGER);
        if (!publicationId) {
            res.status(400).json({ error: 'Invalid public character id.' });
            return;
        }

        try {
            const owned = await get(
                'SELECT id FROM public_characters WHERE id = ? AND user_id = ?',
                [publicationId, userId]
            );
            if (!owned) {
                res.status(404).json({ error: 'Publication not found.' });
                return;
            }
            await run('DELETE FROM public_character_imports WHERE publication_id = ?', [
                publicationId
            ]);
            await run('DELETE FROM public_characters WHERE id = ? AND user_id = ?', [
                publicationId,
                userId
            ]);
            res.json({ ok: true });
        } catch (error) {
            console.error('Failed to unpublish character:', error);
            res.status(500).json({ error: 'Failed to unpublish character.' });
        }
    });
}
