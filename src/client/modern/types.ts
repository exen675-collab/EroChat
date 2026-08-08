import type { BootstrapUser } from '../auth.js';

export type ViewId = 'chat' | 'characters' | 'browse' | 'generator' | 'gallery' | 'stats';
export type ImageProvider = 'swarm' | 'comfy' | 'nanogpt';

export interface ModernMessage {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    imageUrl?: string | null;
    videoUrl?: string | null;
    editedAt?: string | null;
    archivedFromModelContext?: boolean;
    archivedMemorySnapshotId?: string;
    createdAt?: string;
}

export interface MemorySnapshot {
    id: string;
    finalText: string;
    createdAt: string;
    messageIds?: string[];
}

export interface ModernCharacter {
    id: string;
    name: string;
    avatar?: string;
    thumbnail?: string;
    systemPrompt: string;
    appearance?: string;
    description?: string;
    background?: string;
    greeting?: string;
    userInfo?: string;
    messages: ModernMessage[];
    memorySnapshots?: MemorySnapshot[];
    contextMessageCount?: number;
    openrouterSessionId?: string | null;
    isDefault?: boolean;
}

export interface PublicCharacter {
    id: number;
    sourceCharacterId: string;
    creator: string;
    creatorId: number;
    isOwner: boolean;
    name: string;
    avatar?: string;
    thumbnail?: string;
    systemPrompt: string;
    appearance?: string;
    description?: string;
    background?: string;
    greeting?: string;
    contextMessageCount?: number;
    imports: number;
    publishedAt: string;
    updatedAt: string;
}

export interface ModernSettings {
    textProvider: string;
    openrouterKey: string;
    openrouterModel: string;
    favoriteOpenRouterModels: string[];
    openrouterReasoningEnabled: boolean;
    openrouterReasoningEffort: string;
    openrouterTtsModel: string;
    ttsVoiceId: string;
    swarmUrl: string;
    swarmModel: string;
    comfyUrl: string;
    comfyModel: string;
    nanogptUrl: string;
    nanogptKey: string;
    nanogptModel: string;
    nanogptQuality: string;
    imageProvider: ImageProvider;
    protectedImagePromptLanguage: 'pl' | 'en' | 'none';
    enableImageGeneration: boolean;
    contextMessageCount: number;
    messageInputHeight: number;
    imgWidth: number;
    imgHeight: number;
    steps: number;
    cfgScale: number;
    sampler: string;
    scheduler: string;
    systemPrompt: string;
    [key: string]: unknown;
}

export interface GalleryItem {
    id: string;
    imageUrl?: string | null;
    videoUrl?: string | null;
    characterId?: string | null;
    characterName?: string;
    characterAvatar?: string;
    source?: string;
    messageId?: string | null;
    createdAt?: string;
    prompt?: string;
    metadata?: Record<string, unknown>;
}

export interface GeneratorPrefs {
    mode: string;
    provider: ImageProvider;
    helperProvider: string;
    prompt: string;
    negativePrompt: string;
    batchCount: number;
    aspectRatio: string;
    imageResolution: string;
    swarmWidth: number;
    swarmHeight: number;
    swarmSteps: number;
    swarmCfgScale: number;
    swarmSampler: string;
    swarmScheduler: string;
    swarmSeedMode: string;
    swarmBaseSeed: number;
    promptPresets: Array<{ name: string; prompt: string; negativePrompt?: string }>;
    [key: string]: unknown;
}

export interface GeneratorJob {
    id: number;
    batchId?: string;
    mode: string;
    provider: ImageProvider;
    status: string;
    prompt: string;
    negativePrompt?: string;
    providerModel?: string;
    requestJson?: Record<string, unknown>;
    errorMessage?: string;
    createdAt?: string;
}

export interface GeneratorAsset {
    id: number;
    mediaType: 'image' | 'video';
    url: string;
    thumbnailUrl?: string | null;
    width?: number | null;
    height?: number | null;
    source?: string;
    metadata?: Record<string, unknown>;
    createdAt?: string;
}

export interface ModernPersistedState {
    settings: ModernSettings;
    characters: ModernCharacter[];
    currentCharacterId: string;
    galleryImages: GalleryItem[];
    gallerySearchQuery: string;
    gallerySortOrder: string;
    galleryFilterCharacterId: string;
    gallerySourceFilter: string;
    currentView: ViewId;
    generatorPrefs: GeneratorPrefs;
    statistics: Record<string, any>;
}

export interface ModernState extends ModernPersistedState {
    user: BootstrapUser;
    generatorJobs: GeneratorJob[];
    generatorAssets: GeneratorAsset[];
}
