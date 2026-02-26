import { defaultSettings } from './config.js';

// Application state
export const state = {
    currentUser: null,
    adminUsers: [],
    creditCosts: null,
    messages: [],
    galleryImages: [],
    galleryFilterCharacterId: 'all',
    sessionId: null,
    isGenerating: false,
    currentCharacterId: null,
    characters: [],
    settings: { ...defaultSettings }
};
