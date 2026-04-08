import { describe, expect, it } from 'vitest';

import { filterAndSortGalleryItems, parseGallerySearchQuery } from '../js/gallery-search.js';

const galleryItems = [
    {
        id: 'chat-1',
        mediaSource: 'chat',
        characterId: 'char-a',
        characterName: 'Alicia',
        prompt: 'cinematic portrait in red silk dress',
        provider: 'comfy',
        providerModel: 'pony-xl',
        createdAt: '2026-04-08T12:00:00.000Z',
        metadata: {
            tags: ['portrait', 'red dress'],
            checkpoint: 'pony-xl'
        }
    },
    {
        id: 'generator-1',
        mediaSource: 'generator',
        characterId: null,
        characterName: 'Generator',
        prompt: 'forest landscape matte painting',
        provider: 'swarm',
        providerModel: 'sdxl-turbo',
        createdAt: '2026-04-07T08:00:00.000Z',
        metadata: {
            tags: ['landscape', 'forest']
        }
    },
    {
        id: 'chat-2',
        mediaSource: 'chat',
        characterId: 'char-b',
        characterName: 'Bella',
        prompt: 'red neon city street at night',
        provider: 'comfy',
        providerModel: 'flux-dev',
        createdAt: '2026-04-06T12:00:00.000Z',
        metadata: {
            tags: ['city', 'night']
        }
    }
];

describe('gallery search helpers', () => {
    it('parses field filters and free-text tokens', () => {
        const parsed = parseGallerySearchQuery('model:pony "red dress" date:2026-04');

        expect(parsed.fieldFilters.model).toEqual(['pony']);
        expect(parsed.fieldFilters.date).toEqual(['2026-04']);
        expect(parsed.generalTerms).toEqual(['red dress']);
    });

    it('matches partial metadata terms across prompt, tags, and model fields', () => {
        const results = filterAndSortGalleryItems(galleryItems, {
            searchQuery: 'pony portrait',
            sortOrder: 'relevance'
        });

        expect(results.map((item) => item.id)).toEqual(['chat-1']);
    });

    it('supports targeted field filters for model and date', () => {
        const results = filterAndSortGalleryItems(galleryItems, {
            searchQuery: 'model:sdxl date:2026-04-07',
            sortOrder: 'relevance'
        });

        expect(results.map((item) => item.id)).toEqual(['generator-1']);
    });

    it('sorts best matches ahead of weaker partial matches', () => {
        const results = filterAndSortGalleryItems(galleryItems, {
            searchQuery: 'red',
            sortOrder: 'relevance'
        });

        expect(results.map((item) => item.id)).toEqual(['chat-1', 'chat-2']);
    });

    it('keeps character filtering strict for generator items without a character id', () => {
        const results = filterAndSortGalleryItems(galleryItems, {
            characterFilter: 'char-a'
        });

        expect(results.map((item) => item.id)).toEqual(['chat-1']);
    });
});