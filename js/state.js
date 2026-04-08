import { defaultGeneratorPrefs, defaultSettings } from './config.js';

function createDefaultStatistics() {
    return {
        dailyActivity: {},
        viewCounts: {
            chat: 0,
            generator: 0,
            gallery: 0,
            stats: 0
        },
        modelUsage: {
            text: {},
            image: {},
            generator: {}
        },
        promptUsage: {},
        lastUpdatedAt: null
    };
}

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
    settings: { ...defaultSettings },
    statistics: createDefaultStatistics()
};

export { createDefaultStatistics };
