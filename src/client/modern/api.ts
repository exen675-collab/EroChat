import { buildChatRequestPreview } from '../chat-request.js';
import { normalizeBaseUrl, normalizeImageScheduler, normalizeSwarmSampler } from '../utils.js';
import type {
    GeneratedCharacterDraft,
    GeneratorAsset,
    GeneratorJob,
    ModernCharacter,
    ModernMessage,
    ModernSettings,
    PublicCharacter
} from './types.js';

async function responsePayload(response: Response): Promise<any> {
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
        throw new Error(
            payload?.error?.message || payload?.error || `Request failed (${response.status})`
        );
    }
    return payload;
}

async function jsonRequest(url: string, init: RequestInit = {}): Promise<any> {
    const response = await fetch(url, {
        cache: 'no-store',
        ...init,
        headers: { 'Content-Type': 'application/json', ...(init.headers || {}) }
    });
    return responsePayload(response);
}

export function createChatPreview(
    settings: ModernSettings,
    character: ModernCharacter,
    messages: ModernMessage[],
    draft: string
) {
    return buildChatRequestPreview({
        draftMessage: draft,
        systemPrompt: character.systemPrompt || settings.systemPrompt,
        protectedImagePromptLanguage: settings.protectedImagePromptLanguage,
        historyMessages: messages,
        memorySnapshots: character.memorySnapshots || [],
        contextMessageCount: character.contextMessageCount || settings.contextMessageCount,
        openrouterKey: settings.openrouterKey,
        openrouterModel: settings.openrouterModel,
        openrouterReasoningEnabled: settings.openrouterReasoningEnabled,
        openrouterReasoningEffort: settings.openrouterReasoningEffort as any,
        openrouterSessionId: character.openrouterSessionId || '',
        currentUrl: window.location.href
    });
}

export async function sendModernChat(
    settings: ModernSettings,
    character: ModernCharacter,
    messages: ModernMessage[],
    draft: string
): Promise<string> {
    if (!settings.openrouterKey) throw new Error('Enter your OpenRouter API key in Settings.');
    if (!settings.openrouterModel) throw new Error('Select an OpenRouter model in Settings.');
    const preview = createChatPreview(settings, character, messages, draft);
    const response = await fetch(preview.url, {
        method: 'POST',
        headers: preview.headers,
        body: JSON.stringify(preview.body)
    });
    const payload = await responsePayload(response);
    const content = payload?.choices?.[0]?.message?.content;
    if (!content) throw new Error('The model returned an empty response.');
    return String(content);
}

export async function sendUtilityRequest(
    settings: ModernSettings,
    messages: Array<{ role: string; content: string }>,
    options: { model?: string; temperature?: number; maxTokens?: number } = {}
): Promise<string> {
    if (!settings.openrouterKey) throw new Error('Enter your OpenRouter API key in Settings.');
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${settings.openrouterKey}`,
            'HTTP-Referer': window.location.href,
            'X-Title': 'EroChat'
        },
        body: JSON.stringify({
            model: options.model || settings.openrouterModel,
            messages,
            temperature: options.temperature ?? 0.4,
            max_tokens: options.maxTokens ?? 1200
        })
    });
    const payload = await responsePayload(response);
    return String(payload?.choices?.[0]?.message?.content || '').trim();
}

export async function fetchOpenRouterModels(settings: ModernSettings): Promise<string[]> {
    const response = await fetch('https://openrouter.ai/api/v1/models', {
        headers: settings.openrouterKey
            ? { Authorization: `Bearer ${settings.openrouterKey}` }
            : undefined
    });
    const payload = await responsePayload(response);
    return (payload?.data || [])
        .map((model: any) => String(model?.id || ''))
        .filter(Boolean)
        .sort((a: string, b: string) => a.localeCompare(b));
}

function parseModels(payload: any): string[] {
    if (Array.isArray(payload)) {
        return payload
            .map((item) =>
                typeof item === 'string'
                    ? item
                    : item?.name || item?.title || item?.filename || item?.path || ''
            )
            .filter(Boolean);
    }
    if (Array.isArray(payload?.models)) return parseModels(payload.models);
    if (Array.isArray(payload?.files)) return parseModels(payload.files);
    if (payload && typeof payload === 'object') {
        for (const value of Object.values(payload)) {
            if (Array.isArray(value)) {
                const parsed = parseModels(value);
                if (parsed.length) return parsed;
            }
        }
    }
    return [];
}

let swarmSessionId = '';

async function getSwarmSession(settings: ModernSettings): Promise<string> {
    const payload = await jsonRequest(`${normalizeBaseUrl(settings.swarmUrl)}/API/GetNewSession`, {
        method: 'POST',
        body: '{}'
    });
    swarmSessionId = payload.session_id;
    return swarmSessionId;
}

export async function fetchProviderModels(
    provider: string,
    settings: ModernSettings
): Promise<string[]> {
    if (provider === 'openrouter') {
        if (!settings.openrouterKey) throw new Error('Enter your OpenRouter API key first.');
        const response = await fetch('https://openrouter.ai/api/v1/images/models', {
            cache: 'no-store',
            headers: { Authorization: `Bearer ${settings.openrouterKey}` }
        });
        const payload = await responsePayload(response);
        return (payload?.data || [])
            .map((model: any) => String(model?.id || ''))
            .filter(Boolean)
            .sort((a: string, b: string) => a.localeCompare(b));
    }
    if (provider === 'comfy') {
        const response = await fetch(`${normalizeBaseUrl(settings.comfyUrl)}/models/checkpoints`, {
            cache: 'no-store'
        });
        return parseModels(await responsePayload(response));
    }
    if (provider === 'nanogpt') {
        const payload = await jsonRequest('/api/nanogpt/images/models', {
            method: 'POST',
            body: JSON.stringify({ baseUrl: settings.nanogptUrl, apiKey: settings.nanogptKey })
        });
        return parseModels(payload?.data || payload);
    }

    if (!swarmSessionId) await getSwarmSession(settings);
    const payload = await jsonRequest(`${normalizeBaseUrl(settings.swarmUrl)}/API/ListModels`, {
        method: 'POST',
        body: JSON.stringify({ session_id: swarmSessionId, path: '', depth: 2 })
    });
    return parseModels(payload);
}

export async function persistRemoteMedia(url: string): Promise<string> {
    if (url.startsWith('/app/media/')) return url;
    if (url.startsWith('data:')) {
        const payload = await jsonRequest('/api/media/store', {
            method: 'POST',
            body: JSON.stringify({ dataUrl: url })
        });
        return payload.url;
    }
    const parsed = new URL(url, window.location.href);
    const host = parsed.hostname.toLowerCase();
    const isLocal =
        ['localhost', '127.0.0.1', '0.0.0.0', '::1'].includes(host) ||
        host.endsWith('.local') ||
        /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[0-1])\.)/.test(host);
    if (isLocal) {
        const response = await fetch(parsed.toString());
        if (!response.ok) throw new Error(`Could not fetch generated media (${response.status}).`);
        const blob = await response.blob();
        return uploadMedia(
            new File([blob], 'generated-image.png', { type: blob.type || 'image/png' })
        );
    }
    const payload = await jsonRequest('/api/media/import-remote', {
        method: 'POST',
        body: JSON.stringify({ url })
    });
    return payload.url;
}

export async function uploadMedia(file: File): Promise<string> {
    const form = new FormData();
    form.append('file', file);
    const response = await fetch('/api/media/upload', { method: 'POST', body: form });
    return (await responsePayload(response)).url;
}

export interface GenerateOptions {
    prompt: string;
    negativePrompt?: string;
    batchCount?: number;
    width?: number;
    height?: number;
    steps?: number;
    cfgScale?: number;
    sampler?: string;
    scheduler?: string;
    seedMode?: string;
    baseSeed?: number;
    model?: string;
}

function randomSeed(): number {
    const words = crypto.getRandomValues(new Uint32Array(1));
    return Math.max(1, words[0]);
}

function seedFor(options: GenerateOptions, index: number): number {
    const base = Number(options.baseSeed) || 1;
    if (options.seedMode === 'fixed') return base;
    if (options.seedMode === 'increment') return base + index;
    return randomSeed();
}

async function generateSwarm(settings: ModernSettings, options: GenerateOptions) {
    if (!options.model && !settings.swarmModel) throw new Error('Select a SwarmUI model first.');
    if (!swarmSessionId) await getSwarmSession(settings);
    const body: Record<string, unknown> = {
        session_id: swarmSessionId,
        images: options.batchCount || 1,
        batchsize: String(options.batchCount || 1),
        prompt: options.prompt,
        negativeprompt: options.negativePrompt || 'bad quality, worst quality',
        model: options.model || settings.swarmModel,
        width: options.width || settings.imgWidth,
        height: options.height || settings.imgHeight,
        steps: options.steps || settings.steps,
        cfgscale: options.cfgScale || settings.cfgScale,
        sampler_name: normalizeSwarmSampler(options.sampler || settings.sampler),
        scheduler: normalizeImageScheduler(options.scheduler || settings.scheduler),
        seed: options.seedMode === 'random' ? -1 : Number(options.baseSeed) || 1,
        aspectratio: 'Custom',
        automaticvae: true
    };
    const payload = await jsonRequest(
        `${normalizeBaseUrl(settings.swarmUrl)}/API/GenerateText2Image`,
        { method: 'POST', body: JSON.stringify(body) }
    );
    const images = payload.images || payload.outputs || [];
    const baseUrl = normalizeBaseUrl(settings.swarmUrl);
    return images.map((item: any) => {
        const value = typeof item === 'string' ? item : item.url || item.image;
        return {
            url: /^(https?:|data:)/i.test(value)
                ? value
                : `${baseUrl}/${String(value).replace(/^\//, '')}`
        };
    });
}

function comfyWorkflow(settings: ModernSettings, options: GenerateOptions, seed: number) {
    const model = options.model || settings.comfyModel;
    return {
        1: { class_type: 'CheckpointLoaderSimple', inputs: { ckpt_name: model } },
        2: { class_type: 'CLIPTextEncode', inputs: { text: options.prompt, clip: ['1', 1] } },
        3: {
            class_type: 'CLIPTextEncode',
            inputs: { text: options.negativePrompt || 'bad quality, worst quality', clip: ['1', 1] }
        },
        4: {
            class_type: 'EmptyLatentImage',
            inputs: {
                width: options.width || settings.imgWidth,
                height: options.height || settings.imgHeight,
                batch_size: 1
            }
        },
        5: {
            class_type: 'KSampler',
            inputs: {
                seed,
                steps: options.steps || settings.steps,
                cfg: options.cfgScale || settings.cfgScale,
                sampler_name: normalizeSwarmSampler(options.sampler || settings.sampler),
                scheduler: normalizeImageScheduler(options.scheduler || settings.scheduler),
                denoise: 1,
                model: ['1', 0],
                positive: ['2', 0],
                negative: ['3', 0],
                latent_image: ['4', 0]
            }
        },
        6: { class_type: 'VAEDecode', inputs: { samples: ['5', 0], vae: ['1', 2] } },
        7: { class_type: 'SaveImage', inputs: { filename_prefix: 'EroChat', images: ['6', 0] } }
    };
}

async function waitForComfy(baseUrl: string, promptId: string): Promise<any> {
    const started = Date.now();
    while (Date.now() - started < 180000) {
        await new Promise((resolve) => window.setTimeout(resolve, 1000));
        const payload = await jsonRequest(`${baseUrl}/history/${encodeURIComponent(promptId)}`);
        const entry = payload[promptId];
        if (!entry) continue;
        for (const output of Object.values(entry.outputs || {}) as any[]) {
            if (output?.images?.[0]) return output.images[0];
        }
        if (entry.status?.status_str === 'error') throw new Error('ComfyUI generation failed.');
    }
    throw new Error('Timed out waiting for ComfyUI.');
}

async function generateComfy(settings: ModernSettings, options: GenerateOptions) {
    if (!options.model && !settings.comfyModel)
        throw new Error('Select a ComfyUI checkpoint first.');
    const baseUrl = normalizeBaseUrl(settings.comfyUrl);
    const results = [];
    for (let index = 0; index < (options.batchCount || 1); index += 1) {
        const seed = seedFor(options, index);
        const queued = await jsonRequest(`${baseUrl}/prompt`, {
            method: 'POST',
            body: JSON.stringify({
                client_id: crypto.randomUUID(),
                prompt: comfyWorkflow(settings, options, seed)
            })
        });
        const image = await waitForComfy(baseUrl, queued.prompt_id);
        const params = new URLSearchParams({
            filename: image.filename || '',
            subfolder: image.subfolder || '',
            type: image.type || 'output'
        });
        results.push({ url: `${baseUrl}/view?${params}`, seed });
    }
    return results;
}

async function generateNanoGpt(settings: ModernSettings, options: GenerateOptions) {
    if (!settings.nanogptKey) throw new Error('Enter your NanoGPT API key first.');
    const model = options.model || settings.nanogptModel;
    if (!model) throw new Error('Select a NanoGPT image model first.');
    const payload = await jsonRequest('/api/nanogpt/images', {
        method: 'POST',
        body: JSON.stringify({
            baseUrl: settings.nanogptUrl,
            apiKey: settings.nanogptKey,
            payload: {
                model,
                prompt: options.prompt,
                n: options.batchCount || 1,
                size: `${options.width || settings.imgWidth}x${options.height || settings.imgHeight}`,
                quality: settings.nanogptQuality
            }
        })
    });
    const data = payload.data || payload.images || [];
    return data
        .map((item: any) => ({ url: typeof item === 'string' ? item : item.url || item.b64_json }))
        .filter((item: any) => item.url)
        .map((item: any) => ({
            ...item,
            url:
                item.url.startsWith?.('http') || item.url.startsWith?.('data:')
                    ? item.url
                    : `data:image/png;base64,${item.url}`
        }));
}

async function generateOpenRouter(settings: ModernSettings, options: GenerateOptions) {
    if (!settings.openrouterKey) throw new Error('Enter your OpenRouter API key first.');
    const model = options.model || settings.openrouterImageModel;
    if (!model) throw new Error('Select an OpenRouter image model first.');

    const results: Array<{ url: string }> = [];
    const batchCount = Math.max(1, Number(options.batchCount) || 1);
    for (let index = 0; index < batchCount; index += 1) {
        const response = await fetch('https://openrouter.ai/api/v1/images', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${settings.openrouterKey}`,
                'HTTP-Referer': window.location.href,
                'X-Title': 'EroChat'
            },
            body: JSON.stringify({ model, prompt: options.prompt, n: 1 })
        });
        const payload = await responsePayload(response);
        const images = Array.isArray(payload?.data) ? payload.data : [];
        for (const image of images) {
            const value = typeof image === 'string' ? image : image?.url || image?.b64_json;
            if (!value) continue;
            results.push({
                url:
                    String(value).startsWith('http') || String(value).startsWith('data:')
                        ? String(value)
                        : `data:${image?.media_type || 'image/png'};base64,${value}`
            });
        }
    }
    if (!results.length) throw new Error('OpenRouter returned no images.');
    return results;
}

export async function generateImages(settings: ModernSettings, options: GenerateOptions) {
    const provider = settings.imageProvider;
    if (provider === 'comfy') return generateComfy(settings, options);
    if (provider === 'nanogpt') return generateNanoGpt(settings, options);
    if (provider === 'openrouter') return generateOpenRouter(settings, options);
    return generateSwarm(settings, options);
}

export async function fetchGeneratorHistory(): Promise<{
    jobs: GeneratorJob[];
    assets: GeneratorAsset[];
}> {
    const [jobs, assets] = await Promise.all([
        jsonRequest('/api/generator/jobs?limit=100'),
        jsonRequest('/api/generator/assets?limit=100')
    ]);
    return { jobs: jobs.jobs || [], assets: assets.assets || [] };
}

export async function createGeneratorJob(input: Record<string, unknown>): Promise<GeneratorJob[]> {
    const payload = await jsonRequest('/api/generator/jobs', {
        method: 'POST',
        body: JSON.stringify({ jobs: [input] })
    });
    return payload.jobs || [];
}

export async function updateGeneratorJob(id: number, patch: Record<string, unknown>): Promise<any> {
    return jsonRequest(`/api/generator/jobs/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(patch)
    });
}

export async function saveGeneratedJobAssets(
    job: GeneratorJob,
    results: Array<{ url: string; seed?: number }>,
    request: Record<string, unknown>,
    options: { mediaType?: 'image' | 'video'; source?: string } = {}
) {
    const assets = [];
    for (const result of results) {
        assets.push({
            mediaType: options.mediaType || 'image',
            url: await persistRemoteMedia(result.url),
            width: request.width,
            height: request.height,
            source: options.source || job.source,
            metadata: { seed: result.seed, model: job.providerModel || '' }
        });
    }
    return updateGeneratorJob(job.id, {
        status: 'completed',
        completedAt: new Date().toISOString(),
        assets
    });
}

export async function updateProfile(input: Record<string, unknown>) {
    return jsonRequest('/api/auth/profile', { method: 'PATCH', body: JSON.stringify(input) });
}

export async function fetchAdminUsers() {
    return (await jsonRequest('/api/admin/users')).users || [];
}

export async function updateAdminCredits(userId: number, credits: number) {
    return jsonRequest(`/api/admin/users/${userId}/credits`, {
        method: 'PATCH',
        body: JSON.stringify({ credits })
    });
}

export async function importCharacterCard(file: File) {
    const form = new FormData();
    form.append('file', file);
    const response = await fetch('/api/characters/import-card', { method: 'POST', body: form });
    return responsePayload(response);
}

export async function fetchPublicCharacters(
    query = '',
    sort: 'newest' | 'popular' | 'name' = 'newest'
): Promise<PublicCharacter[]> {
    const params = new URLSearchParams({ sort });
    if (query.trim()) params.set('q', query.trim());
    return (await jsonRequest(`/api/characters/browse?${params}`)).characters || [];
}

export async function generateAdminCharacter(input: {
    apiKey: string;
    model: string;
    referenceCharacterIds: number[];
    brief: string;
}): Promise<GeneratedCharacterDraft> {
    return (
        await jsonRequest('/api/admin/characters/generate', {
            method: 'POST',
            body: JSON.stringify(input)
        })
    ).draft;
}

export async function publishGeneratedCharacter(
    draft: GeneratedCharacterDraft
): Promise<PublicCharacter> {
    return (
        await jsonRequest('/api/admin/characters/publish', {
            method: 'POST',
            body: JSON.stringify({ draft })
        })
    ).character;
}

export async function publishCharacter(character: ModernCharacter): Promise<PublicCharacter> {
    const payload = {
        sourceCharacterId: character.id,
        name: character.name,
        avatar: character.avatar,
        thumbnail: character.thumbnail,
        description: character.description,
        appearance: character.appearance,
        background: character.background,
        greeting: character.greeting,
        systemPrompt: character.systemPrompt,
        contextMessageCount: character.contextMessageCount
    };
    return (
        await jsonRequest('/api/characters/publish', {
            method: 'POST',
            body: JSON.stringify({ character: payload })
        })
    ).character;
}

export async function importPublicCharacter(publicationId: number): Promise<PublicCharacter> {
    return (await jsonRequest(`/api/characters/browse/${publicationId}/import`, { method: 'POST' }))
        .character;
}

export async function unpublishCharacter(publicationId: number): Promise<void> {
    await jsonRequest(`/api/characters/published/${publicationId}`, { method: 'DELETE' });
}

export async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    window.location.href = '/';
}

export async function generateSpeech(
    settings: ModernSettings,
    text: string
): Promise<HTMLAudioElement> {
    const response = await fetch('https://openrouter.ai/api/v1/audio/speech', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${settings.openrouterKey}`
        },
        body: JSON.stringify({
            model: settings.openrouterTtsModel,
            voice: settings.ttsVoiceId,
            input: text,
            response_format: 'mp3'
        })
    });
    if (!response.ok) throw new Error('Text-to-speech generation failed.');
    const audio = new Audio(URL.createObjectURL(await response.blob()));
    await audio.play();
    return audio;
}
