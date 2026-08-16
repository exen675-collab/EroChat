import { defaultCharacter, defaultGeneratorPrefs, defaultSettings } from '../config.js';
import type {
    MediaGenerationPreset,
    ModernCharacter,
    ModernPersistedState,
    ModernSettings,
    ViewId
} from './types.js';

const USER_STORAGE_KEY_PREFIX = 'erochat_data_user_';
const VIEWS: ViewId[] = ['chat', 'characters', 'browse', 'generator', 'gallery', 'stats'];

export function getModernStorageKey(userId: number | string): string {
    return `${USER_STORAGE_KEY_PREFIX}${userId}`;
}

function fallbackCharacter(): ModernCharacter {
    return {
        ...defaultCharacter,
        avatar: '🤖',
        systemPrompt: defaultCharacter.systemPrompt,
        messages: [],
        memorySnapshots: []
    } as ModernCharacter;
}

export function createModernDefaultState(): ModernPersistedState {
    return {
        settings: {
            ...defaultSettings,
            favoriteOpenRouterModels: [],
            openrouterTtsModel: 'x-ai/grok-voice-tts-1.0',
            ttsVoiceId: 'ara'
        } as ModernSettings,
        characters: [fallbackCharacter()],
        currentCharacterId: 'default',
        galleryImages: [],
        gallerySearchQuery: '',
        gallerySortOrder: 'newest',
        galleryFilterCharacterId: 'all',
        gallerySourceFilter: 'all',
        currentView: 'chat',
        generatorPrefs: { ...defaultGeneratorPrefs, promptPresets: [] },
        statistics: {
            dailyActivity: {},
            viewCounts: { chat: 0, characters: 0, browse: 0, generator: 0, gallery: 0, stats: 0 },
            modelUsage: { text: {}, image: {}, generator: {} },
            recentModels: { openrouter: [] },
            promptUsage: {},
            lastUpdatedAt: null
        }
    } as ModernPersistedState;
}

function normalizeCharacter(character: Partial<ModernCharacter>): ModernCharacter {
    return {
        ...fallbackCharacter(),
        ...character,
        id: String(character.id || crypto.randomUUID()),
        name: String(character.name || 'Untitled character'),
        avatar: character.avatar && !character.avatar.includes('ðŸ') ? character.avatar : '✨',
        messages: Array.isArray(character.messages) ? character.messages : [],
        memorySnapshots: Array.isArray(character.memorySnapshots) ? character.memorySnapshots : [],
        contextMessageCount: Number(character.contextMessageCount) || 20
    };
}

function legacyProviderModel(provider: string, settings: Record<string, any>): string {
    if (provider === 'comfy') return String(settings.comfyModel || '');
    if (provider === 'nanogpt') return String(settings.nanogptModel || '');
    if (provider === 'openrouter') return String(settings.openrouterImageModel || '');
    return String(settings.swarmModel || '');
}

function normalizePresets(
    value: unknown,
    settings: Record<string, any> = {},
    generatorPrefs: Record<string, any> = {}
): MediaGenerationPreset[] {
    const defaults = defaultGeneratorPrefs.presets as MediaGenerationPreset[];
    if (!Array.isArray(value) || value.length === 0) {
        return defaults.map((preset) => {
            const isChat = preset.id === 'chat-default';
            const provider = String(
                isChat
                    ? settings.imageProvider || preset.provider
                    : generatorPrefs.provider || settings.imageProvider || preset.provider
            ) as MediaGenerationPreset['provider'];
            return {
                ...preset,
                provider,
                providerModel: legacyProviderModel(provider, settings),
                width:
                    Number(
                        isChat ? settings.imgWidth : generatorPrefs.swarmWidth || settings.imgWidth
                    ) || preset.width,
                height:
                    Number(
                        isChat
                            ? settings.imgHeight
                            : generatorPrefs.swarmHeight || settings.imgHeight
                    ) || preset.height,
                steps:
                    Number(isChat ? settings.steps : generatorPrefs.swarmSteps || settings.steps) ||
                    preset.steps,
                cfgScale:
                    Number(
                        isChat
                            ? settings.cfgScale
                            : generatorPrefs.swarmCfgScale || settings.cfgScale
                    ) || preset.cfgScale,
                sampler: String(
                    (isChat ? settings.sampler : generatorPrefs.swarmSampler || settings.sampler) ||
                        preset.sampler
                ),
                scheduler: String(
                    (isChat
                        ? settings.scheduler
                        : generatorPrefs.swarmScheduler || settings.scheduler) || preset.scheduler
                )
            };
        });
    }
    return value
        .filter((preset) => preset && typeof preset === 'object')
        .map((preset: Partial<MediaGenerationPreset>) => {
            const fallback = defaults.find((item) => item.id === preset.id) || defaults[0];
            return {
                ...fallback,
                ...preset,
                id: String(preset.id || crypto.randomUUID()),
                name: String(preset.name || 'Untitled preset'),
                loras: Array.isArray(preset.loras) ? preset.loras : []
            } as MediaGenerationPreset;
        });
}

export function hydrateModernState(
    userId: number | string,
    storage: Storage = localStorage
): ModernPersistedState {
    const defaults = createModernDefaultState();
    const raw = storage.getItem(getModernStorageKey(userId));
    if (!raw) return defaults;

    try {
        const parsed = JSON.parse(raw);
        const characters = Array.isArray(parsed.characters)
            ? parsed.characters.map(normalizeCharacter)
            : defaults.characters;
        const currentCharacterId = characters.some(
            (character: ModernCharacter) => character.id === parsed.currentCharacterId
        )
            ? parsed.currentCharacterId
            : characters[0]?.id || 'default';

        return {
            ...defaults,
            ...parsed,
            settings: {
                ...defaults.settings,
                ...(parsed.settings || {}),
                favoriteOpenRouterModels: Array.isArray(parsed.settings?.favoriteOpenRouterModels)
                    ? parsed.settings.favoriteOpenRouterModels
                    : []
            },
            characters: characters.length ? characters : defaults.characters,
            currentCharacterId,
            galleryImages: Array.isArray(parsed.galleryImages) ? parsed.galleryImages : [],
            gallerySourceFilter:
                parsed.gallerySourceFilter === 'generator'
                    ? 'manual'
                    : parsed.gallerySourceFilter || defaults.gallerySourceFilter,
            currentView: VIEWS.includes(parsed.currentView) ? parsed.currentView : 'chat',
            generatorPrefs: {
                ...defaults.generatorPrefs,
                ...(parsed.generatorPrefs || {}),
                promptPresets: Array.isArray(parsed.generatorPrefs?.promptPresets)
                    ? parsed.generatorPrefs.promptPresets
                    : [],
                presets: normalizePresets(
                    parsed.generatorPrefs?.presets,
                    parsed.settings,
                    parsed.generatorPrefs
                )
            },
            statistics: { ...defaults.statistics, ...(parsed.statistics || {}) }
        };
    } catch {
        return defaults;
    }
}

export function persistModernState(
    userId: number | string,
    state: ModernPersistedState,
    storage: Storage = localStorage
): boolean {
    try {
        storage.setItem(getModernStorageKey(userId), JSON.stringify(state));
        return true;
    } catch (error) {
        console.error('Failed to persist modern app state:', error);
        return false;
    }
}
