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
