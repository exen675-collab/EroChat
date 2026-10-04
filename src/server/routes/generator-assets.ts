import type { Express } from 'express';
import { requireApiAuth } from '../middleware/auth';
import type { Database } from '../database';
import { normalizePositiveInt } from '../utils';
import { mapGeneratorAssetRow } from '../generator';

export function registerGeneratorAssetRoutes(app: Express, db: Database) {
    const { all } = db;
    app.get('/api/generator/assets', requireApiAuth, async (req, res) => {
        const userId = req.session.userId;
        const limit = normalizePositiveInt(req.query?.limit, 60, 1, 120);
        const cursor = normalizePositiveInt(req.query?.cursor, 0, 0, Number.MAX_SAFE_INTEGER);

        const params = [userId];
        let query = `
    SELECT
      a.*,
      j.prompt AS job_prompt,
      j.mode AS job_mode,
      j.provider AS job_provider,
      j.provider_model AS job_provider_model,
      j.character_id AS job_character_id,
      j.message_id AS job_message_id,
      j.status AS job_status,
      j.batch_id
    FROM generator_assets a
    LEFT JOIN generator_jobs j ON j.id = a.job_id
    WHERE a.user_id = ?
  `;

        if (cursor > 0) {
            query += ' AND a.id < ?';
            params.push(cursor);
        }

        query += ' ORDER BY a.id DESC LIMIT ?';
        params.push(limit);

        try {
            const rows = await all(query, params);
            res.json({
                assets: rows.map(mapGeneratorAssetRow),
                nextCursor: rows.length === limit ? rows[rows.length - 1].id : null
            });
        } catch (error) {
            console.error('Failed to load generator assets:', error);
            res.status(500).json({ error: 'Failed to load generator assets.' });
        }
    });
}
