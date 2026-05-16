// @ts-nocheck
import { DEFAULT_CHARACTER_SYSTEM_PROMPT } from './static-prompts.js';

// Default character configuration
export const defaultCharacter = {
    id: 'default',
    name: 'Default Character',
    avatar: '🤖',
    systemPrompt: DEFAULT_CHARACTER_SYSTEM_PROMPT,
    isDefault: true,
    messages: [],
    contextMessageCount: 20,
    memorySnapshots: []
};

// Default settings
export const defaultSettings = {
    textProvider: 'openrouter',
    openrouterKey: '',
    openrouterModel: 'anthropic/claude-3.5-sonnet',
    openrouterReasoningEnabled: false,
    openrouterReasoningEffort: 'medium',
    openrouterTtsModel: 'x-ai/grok-voice-tts-1.0',
    ttsVoiceId: 'ara',
    swarmUrl: 'http://localhost:7801',
    swarmModel: '',
    comfyUrl: 'http://localhost:8188',
    comfyModel: '',
    imageProvider: 'swarm',
    enableImageGeneration: true,
    contextMessageCount: 20,
    messageInputHeight: 192,
    imgWidth: 832,
    imgHeight: 1216,
    steps: 25,
    cfgScale: 7,
    sampler: 'euler_ancestral',
    systemPrompt: defaultCharacter.systemPrompt
};

export const defaultGeneratorPrefs = {
    mode: 'image_generate',
    provider: 'swarm',
    helperProvider: 'off',
    prompt: '',
    negativePrompt: '',
    batchCount: 1,
    aspectRatio: 'auto',
    imageResolution: '1k',
    editResolution: '1k',
    videoDuration: 4,
    videoAspectRatio: '16:9',
    videoResolution: '480p',
    swarmWidth: 832,
    swarmHeight: 1216,
    swarmSteps: 25,
    swarmCfgScale: 7,
    swarmSampler: 'euler_ancestral',
    swarmSeedMode: 'random',
    swarmBaseSeed: 1,
    promptPresets: []
};
