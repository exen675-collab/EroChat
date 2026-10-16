import type { Express } from 'express';
import { requireApiAuth } from '../middleware/auth';
import type { Database } from '../database';
import { normalizePositiveInt } from '../utils';
import { mapGeneratorAssetRow } from '../generator';

export function registerGeneratorAssetRoutes(app: Express, db: Database) {
    const { all, get, run } = db;
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

    // Totals across every page, so statistics don't depend on how much of the gallery is loaded.
    app.get('/api/generator/assets/summary', requireApiAuth, async (req, res) => {
        try {
            const row = await get(
                `SELECT COUNT(*) AS total, COALESCE(SUM(media_type = 'video'), 0) AS videos
                 FROM generator_assets WHERE user_id = ?`,
                [req.session.userId]
            );
            const total = Number(row?.total) || 0;
            const videos = Number(row?.videos) || 0;
            res.json({ total, images: total - videos, videos });
        } catch (error) {
            console.error('Failed to summarize generator assets:', error);
            res.status(500).json({ error: 'Failed to summarize generator assets.' });
        }
    });

    // Removes the asset from the user's gallery. The media file is kept: chat messages, character
    // thumbnails, and published characters can still point at its URL.
    app.delete('/api/generator/assets/:assetId', requireApiAuth, async (req, res) => {
        const rawId = String(req.params?.assetId ?? '');
        const assetId = /^\d+$/.test(rawId) ? Number(rawId) : 0;
        if (!Number.isSafeInteger(assetId) || assetId <= 0) {
            res.status(400).json({ error: 'Invalid generator asset ID.' });
            return;
        }

        try {
            const result = await run('DELETE FROM generator_assets WHERE id = ? AND user_id = ?', [
                assetId,
                req.session.userId
            ]);
            if (!result.changes) {
                res.status(404).json({ error: 'Generator asset not found.' });
                return;
            }
            res.json({ ok: true });
        } catch (error) {
            console.error('Failed to remove generator asset:', error);
            res.status(500).json({ error: 'Failed to remove the asset.' });
        }
    });
}
