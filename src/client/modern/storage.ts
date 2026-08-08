import { defaultCharacter, defaultGeneratorPrefs, defaultSettings } from '../config.js';
import type { ModernCharacter, ModernPersistedState, ModernSettings, ViewId } from './types.js';

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
            currentView: VIEWS.includes(parsed.currentView) ? parsed.currentView : 'chat',
            generatorPrefs: {
                ...defaults.generatorPrefs,
                ...(parsed.generatorPrefs || {}),
                promptPresets: Array.isArray(parsed.generatorPrefs?.promptPresets)
                    ? parsed.generatorPrefs.promptPresets
                    : []
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
