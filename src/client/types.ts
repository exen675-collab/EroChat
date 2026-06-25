export type ChatRole = 'system' | 'user' | 'assistant';

export interface ChatMessage {
    id?: string | null;
    role: ChatRole | string;
    content: string;
    imageUrl?: string | null;
    videoUrl?: string | null;
    archivedFromModelContext?: boolean;
    [key: string]: unknown;
}

export interface Character {
    id: string;
    name: string;
    avatar?: string;
    systemPrompt?: string;
    description?: string;
    background?: string;
    greeting?: string;
    messages: ChatMessage[];
    [key: string]: unknown;
}

export interface AppSettings {
    textProvider?: string;
    openrouterModel?: string;
    imageProvider?: string;
    protectedImagePromptLanguage?: 'pl' | 'en' | 'none';
    enableImageGeneration?: boolean;
    contextMessageCount?: number;
    [key: string]: unknown;
}

export interface GalleryItem {
    id?: string;
    url: string;
    mediaType?: 'image' | 'video' | string;
    source?: string;
    characterId?: string | null;
    metadata?: Record<string, unknown>;
    createdAt?: string;
    [key: string]: unknown;
}

export interface GeneratorJob {
    id: number | string;
    status: string;
    provider?: string;
    request?: Record<string, unknown>;
    resultAssetIds?: Array<number | string>;
    [key: string]: unknown;
}

export interface GeneratorAsset {
    id: number | string;
    mediaType: string;
    url: string;
    width?: number | null;
    height?: number | null;
    metadata?: Record<string, unknown>;
    [key: string]: unknown;
}

export interface Statistics {
    dailyActivity: Record<string, unknown>;
    viewCounts: Record<string, number>;
    modelUsage: Record<string, Record<string, unknown>>;
    recentModels: Record<string, unknown[]>;
    promptUsage: Record<string, unknown>;
    lastUpdatedAt: string | null;
}

export interface CharacterCardV2 {
    spec: 'chara_card_v2';
    spec_version: string;
    data: Record<string, unknown> & { name: string };
}

export interface ChatRequestPreview {
    provider: string;
    url: string;
    headers: Record<string, string>;
    body: Record<string, unknown>;
}
