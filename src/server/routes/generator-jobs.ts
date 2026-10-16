import type { Express } from 'express';
import { requireApiAuth } from '../middleware/auth';
import type { Database } from '../database';
import {
    generateId,
    normalizePositiveInt,
    normalizeIntegerArray,
    parseJsonObject,
    stringifyJson
} from '../utils';
import {
    GENERATOR_ALLOWED_SOURCES,
    GENERATOR_ALLOWED_MEDIA_TYPES,
    GENERATOR_ALLOWED_EXECUTION_BACKENDS,
    normalizeGeneratorMode,
    normalizeGeneratorProvider,
    normalizeGeneratorStatus,
    isTerminalGeneratorStatus,
    mapGeneratorJobRow,
    getGeneratorAssetsByIds,
    settleStaleGeneratorJobs
} from '../generator';

export function registerGeneratorJobRoutes(app: Express, db: Database) {
    const { run, get, all } = db;
    app.get('/api/generator/jobs', requireApiAuth, async (req, res) => {
        const userId = req.session.userId;
        const limit = normalizePositiveInt(req.query?.limit, 40, 1, 100);
        const cursor = normalizePositiveInt(req.query?.cursor, 0, 0, Number.MAX_SAFE_INTEGER);
        const statusFilter =
            req.query?.status == null || req.query.status === ''
                ? null
                : normalizeGeneratorStatus(req.query.status);

        if (req.query?.status && !statusFilter) {
            res.status(400).json({ error: 'Invalid generator status filter.' });
            return;
        }

        const params: any[] = [userId];
        let query = 'SELECT * FROM generator_jobs WHERE user_id = ?';

        try {
            await settleStaleGeneratorJobs(db, userId);
        } catch (error) {
            console.error('Failed to settle stale generator jobs:', error);
        }

        if (statusFilter) {
            query += ' AND status = ?';
            params.push(statusFilter);
        }

        if (cursor > 0) {
            query += ' AND id < ?';
            params.push(cursor);
        }

        query += ' ORDER BY id DESC LIMIT ?';
        params.push(limit);

        try {
            const rows = await all(query, params);
            res.json({
                jobs: rows.map(mapGeneratorJobRow),
                nextCursor: rows.length === limit ? rows[rows.length - 1].id : null
            });
        } catch (error) {
            console.error('Failed to load generator jobs:', error);
            res.status(500).json({ error: 'Failed to load generator jobs.' });
        }
    });

    app.post('/api/generator/jobs', requireApiAuth, async (req, res) => {
        const userId = req.session.userId;
        const inputJobs = Array.isArray(req.body?.jobs) ? req.body.jobs : null;
        if (!inputJobs || inputJobs.length === 0) {
            res.status(400).json({ error: 'At least one generator job is required.' });
            return;
        }

        if (inputJobs.length > 20) {
            res.status(400).json({ error: 'Too many generator jobs were submitted at once.' });
            return;
        }

        const insertedIds = [];

        try {
            for (const inputJob of inputJobs) {
                const mode = normalizeGeneratorMode(inputJob?.mode);
                const provider = normalizeGeneratorProvider(inputJob?.provider);
                const prompt = typeof inputJob?.prompt === 'string' ? inputJob.prompt.trim() : '';
                const source = GENERATOR_ALLOWED_SOURCES.has(inputJob?.source)
                    ? inputJob.source
                    : 'manual';
                const mediaType = GENERATOR_ALLOWED_MEDIA_TYPES.has(inputJob?.mediaType)
                    ? inputJob.mediaType
                    : mode === 'video_generate'
                      ? 'video'
                      : 'image';
                const executionBackend = GENERATOR_ALLOWED_EXECUTION_BACKENDS.has(
                    inputJob?.executionBackend
                )
                    ? inputJob.executionBackend
                    : 'local';

                if (!mode || !provider || !prompt) {
                    res.status(400).json({
                        error: 'Each generator job requires mode, provider, and prompt.'
                    });
                    return;
                }

                const batchId =
                    typeof inputJob?.batchId === 'string' && inputJob.batchId.trim()
                        ? inputJob.batchId.trim()
                        : generateId();
                const negativePrompt =
                    typeof inputJob?.negativePrompt === 'string' && inputJob.negativePrompt.trim()
                        ? inputJob.negativePrompt.trim()
                        : null;
                const sourceAssetIds = Array.isArray(inputJob?.sourceAssetIds)
                    ? Array.from(
                          new Set(
                              inputJob.sourceAssetIds
                                  .map((value) => Number.parseInt(value, 10))
                                  .filter((value) => Number.isFinite(value) && value > 0)
                          )
                      )
                    : [];
                const providerModel =
                    typeof inputJob?.providerModel === 'string'
                        ? inputJob.providerModel.trim()
                        : '';
                const presetId =
                    typeof inputJob?.presetId === 'string' && inputJob.presetId.trim()
                        ? inputJob.presetId.trim()
                        : null;
                const characterId =
                    typeof inputJob?.characterId === 'string' && inputJob.characterId.trim()
                        ? inputJob.characterId.trim()
                        : null;
                const messageId =
                    typeof inputJob?.messageId === 'string' && inputJob.messageId.trim()
                        ? inputJob.messageId.trim()
                        : null;
                const requestJson =
                    inputJob?.requestJson &&
                    typeof inputJob.requestJson === 'object' &&
                    !Array.isArray(inputJob.requestJson)
                        ? inputJob.requestJson
                        : {};

                const result = await run(
                    `
          INSERT INTO generator_jobs (
            user_id,
            batch_id,
            mode,
            provider,
            status,
            source,
            media_type,
            preset_id,
            execution_backend,
            character_id,
            message_id,
            prompt,
            negative_prompt,
            source_asset_ids,
            provider_model,
            request_json
          ) VALUES (?, ?, ?, ?, 'queued', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
                    [
                        userId,
                        batchId,
                        mode,
                        provider,
                        source,
                        mediaType,
                        presetId,
                        executionBackend,
                        characterId,
                        messageId,
                        prompt,
                        negativePrompt,
                        stringifyJson(sourceAssetIds, []),
                        providerModel,
                        stringifyJson(requestJson, {})
                    ]
                );

                insertedIds.push(result.lastID);
            }

            const placeholders = insertedIds.map(() => '?').join(', ');
            const rows = await all(
                `SELECT * FROM generator_jobs WHERE user_id = ? AND id IN (${placeholders}) ORDER BY id DESC`,
                [userId, ...insertedIds]
            );

            res.status(201).json({ jobs: rows.map(mapGeneratorJobRow) });
        } catch (error) {
            console.error('Failed to create generator jobs:', error);
            res.status(500).json({ error: 'Failed to create generator jobs.' });
        }
    });

    app.patch('/api/generator/jobs/:jobId', requireApiAuth, async (req, res) => {
        const userId = req.session.userId;
        const jobId = Number.parseInt(String(req.params?.jobId), 10);
        if (!Number.isFinite(jobId) || jobId <= 0) {
            res.status(400).json({ error: 'Invalid generator job ID.' });
            return;
        }

        try {
            const existing = await get(
                'SELECT * FROM generator_jobs WHERE id = ? AND user_id = ?',
                [jobId, userId]
            );
            if (!existing) {
                res.status(404).json({ error: 'Generator job not found.' });
                return;
            }

            const status =
                req.body?.status == null
                    ? existing.status
                    : normalizeGeneratorStatus(req.body.status);
            if (!status) {
                res.status(400).json({ error: 'Invalid generator job status.' });
                return;
            }

            const providerRequestId =
                req.body?.providerRequestId === null
                    ? null
                    : typeof req.body?.providerRequestId === 'string' &&
                        req.body.providerRequestId.trim()
                      ? req.body.providerRequestId.trim()
                      : existing.provider_request_id;

            const errorMessage =
                req.body?.errorMessage === null
                    ? null
                    : typeof req.body?.errorMessage === 'string' && req.body.errorMessage.trim()
                      ? req.body.errorMessage.trim()
                      : existing.error_message;

            const requestJson =
                req.body?.requestJson &&
                typeof req.body.requestJson === 'object' &&
                !Array.isArray(req.body.requestJson)
                    ? req.body.requestJson
                    : parseJsonObject(existing.request_json);

            const creditsCharged = Number.isFinite(req.body?.creditsCharged)
                ? Math.max(0, Math.trunc(req.body.creditsCharged))
                : Number.isFinite(existing.credits_charged)
                  ? existing.credits_charged
                  : 0;

            const assetInputs = Array.isArray(req.body?.assets) ? req.body.assets : [];
            const insertedAssetIds = [];
            // Validate every asset before writing any, so a rejected request stores nothing.
            const preparedAssets = [];

            for (const assetInput of assetInputs) {
                const mediaType =
                    assetInput?.mediaType === 'video'
                        ? 'video'
                        : assetInput?.mediaType === 'image'
                          ? 'image'
                          : null;
                const url = typeof assetInput?.url === 'string' ? assetInput.url.trim() : '';
                const thumbnailUrl =
                    typeof assetInput?.thumbnailUrl === 'string' && assetInput.thumbnailUrl.trim()
                        ? assetInput.thumbnailUrl.trim()
                        : null;

                if (!mediaType || !url || !url.startsWith('/app/media/')) {
                    res.status(400).json({
                        error: 'Generator assets must use stored /app/media/ URLs.'
                    });
                    return;
                }

                const width = Number.isFinite(assetInput?.width)
                    ? Math.max(0, Math.trunc(assetInput.width))
                    : null;
                const height = Number.isFinite(assetInput?.height)
                    ? Math.max(0, Math.trunc(assetInput.height))
                    : null;
                const durationSeconds = Number.isFinite(assetInput?.durationSeconds)
                    ? Math.max(0, Math.trunc(assetInput.durationSeconds))
                    : null;
                const metadata =
                    assetInput?.metadata &&
                    typeof assetInput.metadata === 'object' &&
                    !Array.isArray(assetInput.metadata)
                        ? assetInput.metadata
                        : {};
                const source = GENERATOR_ALLOWED_SOURCES.has(assetInput?.source)
                    ? assetInput.source
                    : existing.source || 'manual';

                preparedAssets.push({
                    mediaType,
                    url,
                    thumbnailUrl,
                    width,
                    height,
                    durationSeconds,
                    source,
                    metadata
                });
            }

            for (const asset of preparedAssets) {
                const result = await run(
                    `
          INSERT INTO generator_assets (
            job_id,
            user_id,
            media_type,
            url,
            thumbnail_url,
            width,
            height,
            duration_seconds,
            source,
            metadata_json
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
                    [
                        jobId,
                        userId,
                        asset.mediaType,
                        asset.url,
                        asset.thumbnailUrl,
                        asset.width,
                        asset.height,
                        asset.durationSeconds,
                        asset.source,
                        stringifyJson(asset.metadata, {})
                    ]
                );

                insertedAssetIds.push(result.lastID);
            }

            const existingResultAssetIds = normalizeIntegerArray(existing.result_asset_ids);
            const resultAssetIds = Array.isArray(req.body?.resultAssetIds)
                ? Array.from(
                      new Set(
                          req.body.resultAssetIds
                              .map((value) => Number.parseInt(value, 10))
                              .filter((value) => Number.isFinite(value) && value > 0)
                      )
                  )
                : Array.from(new Set([...existingResultAssetIds, ...insertedAssetIds]));

            let completedAt = existing.completed_at || null;
            if (req.body?.completedAt === null) {
                completedAt = null;
            } else if (typeof req.body?.completedAt === 'string' && req.body.completedAt.trim()) {
                completedAt = req.body.completedAt.trim();
            } else if (isTerminalGeneratorStatus(status) && !completedAt) {
                completedAt = new Date().toISOString();
            }

            await run(
                `
        UPDATE generator_jobs
        SET
          status = ?,
          provider_request_id = ?,
          request_json = ?,
          result_asset_ids = ?,
          error_message = ?,
          credits_charged = ?,
          updated_at = CURRENT_TIMESTAMP,
          completed_at = ?
        WHERE id = ? AND user_id = ?
      `,
                [
                    status,
                    providerRequestId,
                    stringifyJson(requestJson, {}),
                    stringifyJson(resultAssetIds, []),
                    errorMessage,
                    creditsCharged,
                    completedAt,
                    jobId,
                    userId
                ]
            );

            const updatedJob = await get(
                'SELECT * FROM generator_jobs WHERE id = ? AND user_id = ?',
                [jobId, userId]
            );
            const createdAssets = await getGeneratorAssetsByIds(db, userId, insertedAssetIds);

            res.json({
                job: mapGeneratorJobRow(updatedJob),
                assets: createdAssets
            });
        } catch (error) {
            console.error('Failed to update generator job:', error);
            res.status(500).json({ error: 'Failed to update generator job.' });
        }
    });
}
