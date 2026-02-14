import { defaultSettings } from './config.js';

// Application state
export const state = {
    messages: [],
    sessionId: null,
    isGenerating: false,
    currentCharacterId: null,
    characters: [],
    settings: { ...defaultSettings }
};
