import type { Database } from './database';
import { normalizeIntegerArray, parseJsonObject } from './utils';

const GENERATOR_ALLOWED_MODES = new Set(['image_generate', 'video_generate']);
const GENERATOR_ALLOWED_PROVIDERS = new Set(['swarm', 'comfy', 'nanogpt', 'openrouter']);
const GENERATOR_ALLOWED_STATUSES = new Set([
    'queued',
    'starting',
    'loading',
    'generating',
    'completed',
    'failed',
    // Legacy states remain readable while persisted jobs migrate naturally.
    'running',
    'polling',
    'succeeded',
    'interrupted'
]);
export const GENERATOR_ALLOWED_SOURCES = new Set([
    'chat',
    'manual',
    'regenerate',
    'character-thumbnail'
]);
export const GENERATOR_ALLOWED_MEDIA_TYPES = new Set(['image', 'video']);
export const GENERATOR_ALLOWED_EXECUTION_BACKENDS = new Set(['local', 'runpod']);

export function normalizeGeneratorMode(value) {
    const normalized = typeof value === 'string' ? value.trim() : '';
    return GENERATOR_ALLOWED_MODES.has(normalized) ? normalized : null;
}

export function normalizeGeneratorProvider(value) {
    const normalized = typeof value === 'string' ? value.trim() : '';
    return GENERATOR_ALLOWED_PROVIDERS.has(normalized) ? normalized : null;
}

export function normalizeGeneratorStatus(value) {
    const normalized = typeof value === 'string' ? value.trim() : '';
    return GENERATOR_ALLOWED_STATUSES.has(normalized) ? normalized : null;
}

export function isTerminalGeneratorStatus(status) {
    return (
        status === 'completed' ||
        status === 'succeeded' ||
        status === 'failed' ||
        status === 'interrupted'
    );
}

export function mapGeneratorJobRow(row) {
    if (!row) return null;
    return {
        id: row.id,
        batchId: row.batch_id,
        userId: row.user_id,
        mode: row.mode,
        provider: row.provider,
        status: row.status,
        source: row.source || 'manual',
        mediaType: row.media_type || (row.mode === 'video_generate' ? 'video' : 'image'),
        presetId: row.preset_id || null,
        executionBackend: row.execution_backend || 'local',
        characterId: row.character_id || null,
        messageId: row.message_id || null,
        prompt: row.prompt || '',
        negativePrompt: row.negative_prompt || null,
        sourceAssetIds: normalizeIntegerArray(row.source_asset_ids),
        providerModel: row.provider_model || '',
        providerRequestId: row.provider_request_id || null,
        requestJson: parseJsonObject(row.request_json),
        resultAssetIds: normalizeIntegerArray(row.result_asset_ids),
        errorMessage: row.error_message || null,
        creditsCharged: Number.isFinite(row.credits_charged) ? row.credits_charged : 0,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        completedAt: row.completed_at || null
    };
}

export function mapGeneratorAssetRow(row) {
    if (!row) return null;
    return {
        id: row.id,
        jobId: row.job_id,
        userId: row.user_id,
        mediaType: row.media_type,
        url: row.url,
        thumbnailUrl: row.thumbnail_url || null,
        width: Number.isFinite(row.width) ? row.width : null,
        height: Number.isFinite(row.height) ? row.height : null,
        durationSeconds: Number.isFinite(row.duration_seconds) ? row.duration_seconds : null,
        source: !row.source || row.source === 'generator' ? 'manual' : row.source,
        characterId: row.job_character_id || null,
        messageId: row.job_message_id || null,
        createdAt: row.created_at,
        metadata: parseJsonObject(row.metadata_json),
        prompt: row.job_prompt || null,
        mode: row.job_mode || null,
        provider: row.job_provider || null,
        providerModel: row.job_provider_model || '',
        jobStatus: row.job_status || null,
        batchId: row.batch_id || null
    };
}

export async function getGeneratorAssetsByIds(db: Database, userId, assetIds) {
    const ids = Array.from(
        new Set(
            assetIds
                .map((value) => Number.parseInt(value, 10))
                .filter((value) => Number.isFinite(value) && value > 0)
        )
    );

    if (ids.length === 0) {
        return [];
    }

    const placeholders = ids.map(() => '?').join(', ');
    const rows = await db.all(
        `
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
      WHERE a.user_id = ? AND a.id IN (${placeholders})
      ORDER BY a.id DESC
    `,
        [userId, ...ids]
    );

    return rows.map(mapGeneratorAssetRow);
}

export const STALE_GENERATOR_JOB_MINUTES = 30;
const PENDING_GENERATOR_STATUSES = [
    'queued',
    'starting',
    'loading',
    'generating',
    'running',
    'polling'
];

// Jobs are driven by the browser that started them, and every step touches updated_at. A job left
// pending this long belonged to a page that closed, so it can never finish; it is marked
// interrupted instead of showing as in progress forever.
export async function settleStaleGeneratorJobs(db: Database, userId) {
    const placeholders = PENDING_GENERATOR_STATUSES.map(() => '?').join(', ');
    await db.run(
        `UPDATE generator_jobs
         SET status = 'interrupted',
             error_message = COALESCE(error_message, ?),
             completed_at = COALESCE(completed_at, CURRENT_TIMESTAMP),
             updated_at = CURRENT_TIMESTAMP
         WHERE user_id = ?
           AND status IN (${placeholders})
           AND updated_at < datetime('now', ?)`,
        [
            'The page running this job closed before it finished.',
            userId,
            ...PENDING_GENERATOR_STATUSES,
            `-${STALE_GENERATOR_JOB_MINUTES} minutes`
        ]
    );
}
