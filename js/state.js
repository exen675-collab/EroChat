import { defaultGeneratorPrefs, defaultSettings } from './config.js';

// Application state
export const state = {
    currentUser: null,
    adminUsers: [],
    creditCosts: null,
    currentView: 'chat',
    messages: [],
    galleryImages: [],
    gallerySourceFilter: 'all',
    galleryFilterCharacterId: 'all',
    generatorJobs: [],
    generatorAssets: [],
    generatorActiveBatchId: null,
    generatorPrefs: { ...defaultGeneratorPrefs },
    sessionId: null,
    isGenerating: false,
    currentCharacterId: null,
    characters: [],
    settings: { ...defaultSettings }
};
