import type {
    GeneratorPrefs,
    MediaGenerationPreset,
    ModernCharacter,
    ModernSettings
} from './types.js';

export function modelForProvider(settings: ModernSettings, preset: MediaGenerationPreset): string {
    if (preset.providerModel) return preset.providerModel;
    if (preset.provider === 'comfy') return settings.comfyModel;
    if (preset.provider === 'nanogpt') return settings.nanogptModel;
    if (preset.provider === 'openrouter') return settings.openrouterImageModel;
    return settings.swarmModel;
}

export function findMediaPreset(
    prefs: GeneratorPrefs,
    presetId: string | null | undefined
): MediaGenerationPreset {
    return (
        prefs.presets.find((preset) => preset.id === presetId) ||
        prefs.presets.find((preset) => preset.id === prefs.selectedPresetId) ||
        prefs.presets[0]
    );
}

export function chatMediaPreset(
    prefs: GeneratorPrefs,
    character?: ModernCharacter | null
): MediaGenerationPreset {
    return findMediaPreset(prefs, character?.generationPresetId || prefs.defaultChatPresetId);
}

export function presetRequest(
    preset: MediaGenerationPreset,
    batchCount = 1
): Record<string, unknown> {
    return {
        batchCount,
        width: preset.width,
        height: preset.height,
        steps: preset.steps,
        cfgScale: preset.cfgScale,
        sampler: preset.sampler,
        scheduler: preset.scheduler,
        seedMode: preset.seedMode,
        baseSeed: preset.baseSeed,
        workflow: preset.workflow || '',
        loras: preset.loras,
        executionBackend: preset.executionBackend
    };
}

export const ASPECT_RATIOS = ['1:1', '16:9', '9:16', '4:3', '3:4'] as const;

function ratioParts(ratio: string): [number, number] {
    const [width, height] = ratio.split(':').map(Number);
    return [width, height];
}

/** Reshapes a size to the ratio at about the same pixel count, in the multiples of 8 latents need. */
export function dimensionsForAspectRatio(
    width: number,
    height: number,
    ratio: string
): { width: number; height: number } {
    const [ratioWidth, ratioHeight] = ratioParts(ratio);
    const area = Math.max(64 * 64, (Number(width) || 1024) * (Number(height) || 1024));
    const snap = (value: number) => Math.max(64, Math.round(value / 8) * 8);
    const scaledWidth = Math.sqrt((area * ratioWidth) / ratioHeight);
    return { width: snap(scaledWidth), height: snap((scaledWidth * ratioHeight) / ratioWidth) };
}

/** The listed ratio a size matches within 2%, or 'auto' for a custom size. */
export function matchingAspectRatio(width: number, height: number): string {
    if (!(width > 0 && height > 0)) return 'auto';
    return (
        ASPECT_RATIOS.find((ratio) => {
            const [ratioWidth, ratioHeight] = ratioParts(ratio);
            return Math.abs(width / height / (ratioWidth / ratioHeight) - 1) < 0.02;
        }) || 'auto'
    );
}
