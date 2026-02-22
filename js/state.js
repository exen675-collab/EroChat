import { defaultSettings } from './config.js';

// Application state
export const state = {
    messages: [],
    galleryImages: [],
    galleryFilterCharacterId: 'all',
    sessionId: null,
    isGenerating: false,
    currentCharacterId: null,
    characters: [],
    settings: { ...defaultSettings }
};
