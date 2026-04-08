const SEARCH_FIELD_ALIASES = Object.freeze({
    tag: 'tags',
    tags: 'tags',
    prompt: 'prompt',
    model: 'model',
    provider: 'provider',
    date: 'date',
    source: 'source',
    character: 'character',
    type: 'type',
    media: 'type'
});

const SEARCH_WEIGHTS = Object.freeze({
    prompt: 7,
    tags: 6,
    model: 5,
    character: 4,
    source: 3,
    provider: 3,
    date: 2,
    type: 2,
    metadata: 1,
    all: 1
});

function normalizeSearchText(value) {
    return String(value || '')
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[_/\\|]+/g, ' ')
        .replace(/[^a-z0-9\s:.-]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function singularizeToken(token) {
    if (token.endsWith('ies') && token.length > 4) {
        return `${token.slice(0, -3)}y`;
    }
    if (token.endsWith('es') && token.length > 4) {
        return token.slice(0, -2);
    }
    if (token.endsWith('s') && token.length > 3) {
        return token.slice(0, -1);
    }
    return token;
}

function getTokenVariants(token) {
    const normalized = normalizeSearchText(token);
    if (!normalized) return [];

    const variants = new Set([normalized, singularizeToken(normalized)]);
    return Array.from(variants).filter(Boolean);
}

function flattenMetadataValues(value, output = [], depth = 0) {
    if (depth > 2 || value == null) {
        return output;
    }

    if (Array.isArray(value)) {
        value.forEach((entry) => flattenMetadataValues(entry, output, depth + 1));
        return output;
    }

    if (typeof value === 'object') {
        Object.values(value).forEach((entry) => flattenMetadataValues(entry, output, depth + 1));
        return output;
    }

    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
        output.push(String(value));
    }

    return output;
}

function formatDateSearchValues(createdAt) {
    if (!createdAt) return [];

    const parsedDate = new Date(createdAt);
    if (Number.isNaN(parsedDate.getTime())) {
        return [String(createdAt)];
    }

    return [
        parsedDate.toISOString(),
        parsedDate.toISOString().slice(0, 10),
        parsedDate.toISOString().slice(0, 7),
        String(parsedDate.getUTCFullYear()),
        parsedDate.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
            timeZone: 'UTC'
        }),
        parsedDate.toLocaleDateString('en-US', {
            month: 'long',
            year: 'numeric',
            timeZone: 'UTC'
        })
    ];
}

function joinSearchValues(values) {
    return normalizeSearchText(
        values
            .flatMap((value) => (Array.isArray(value) ? value : [value]))
            .filter((value) => value != null && String(value).trim())
            .join(' ')
    );
}

function buildSearchFields(item) {
    const metadata =
        item?.metadata && typeof item.metadata === 'object' && !Array.isArray(item.metadata)
            ? item.metadata
            : {};
    const metadataValues = flattenMetadataValues(metadata);
    const mediaType = item?.mediaType || (item?.videoUrl ? 'video' : 'image');

    const fields = {
        prompt: joinSearchValues([
            item?.prompt,
            item?.negativePrompt,
            metadata.prompt,
            metadata.caption,
            metadata.description
        ]),
        tags: joinSearchValues([
            metadata.tags,
            metadata.tag,
            metadata.keywords,
            metadata.styles,
            metadata.subjects,
            metadata.categories
        ]),
        model: joinSearchValues([
            item?.providerModel,
            item?.model,
            metadata.model,
            metadata.modelName,
            metadata.providerModel,
            metadata.checkpoint,
            metadata.checkpointName,
            metadata.baseModel
        ]),
        provider: joinSearchValues([item?.provider, metadata.provider]),
        source: joinSearchValues([item?.mediaSource, item?.source, item?.mode]),
        character: joinSearchValues([item?.characterName, item?.characterId]),
        type: joinSearchValues([mediaType]),
        date: joinSearchValues(formatDateSearchValues(item?.createdAt)),
        metadata: joinSearchValues(metadataValues)
    };

    return {
        ...fields,
        all: joinSearchValues(Object.values(fields))
    };
}

function parseSearchQuery(query) {
    const fieldFilters = {};
    const generalTerms = [];
    const matcher = /([a-z]+):"([^"]+)"|([a-z]+):(\S+)|"([^"]+)"|(\S+)/gi;

    let match = matcher.exec(query);
    while (match) {
        const fieldName = SEARCH_FIELD_ALIASES[(match[1] || match[3] || '').toLowerCase()];
        const fieldValue = match[2] || match[4] || '';
        const phrase = match[5] || '';
        const term = match[6] || '';

        if (fieldName && fieldValue) {
            if (!fieldFilters[fieldName]) {
                fieldFilters[fieldName] = [];
            }
            fieldFilters[fieldName].push(normalizeSearchText(fieldValue));
        } else {
            const freeText = normalizeSearchText(phrase || term || match[0]);
            if (freeText) {
                generalTerms.push(freeText);
            }
        }

        match = matcher.exec(query);
    }

    return {
        fieldFilters,
        generalTerms
    };
}

function getTextMatchScore(haystack, token) {
    if (!haystack || !token) return 0;

    const variants = getTokenVariants(token);
    for (const variant of variants) {
        if (!variant) continue;
        if (haystack === variant) return 120;
        if (` ${haystack} `.includes(` ${variant} `)) return 90;
        if (haystack.startsWith(variant) || haystack.includes(` ${variant}`)) return 64;
        if (haystack.includes(variant)) return 36;
    }

    return 0;
}

function getTimestamp(item) {
    return Date.parse(item?.createdAt || '') || 0;
}

function evaluateGalleryItem(item, parsedQuery) {
    const fields = buildSearchFields(item);
    let score = 0;

    for (const [fieldName, tokens] of Object.entries(parsedQuery.fieldFilters)) {
        const haystack = fields[fieldName] || '';
        const matchesAllTokens = tokens.every((token) => getTextMatchScore(haystack, token) > 0);
        if (!matchesAllTokens) {
            return { matches: false, score: 0 };
        }
        score += tokens.length * 100;
    }

    for (const token of parsedQuery.generalTerms) {
        let bestScore = 0;

        Object.entries(SEARCH_WEIGHTS).forEach(([fieldName, weight]) => {
            const fieldScore = getTextMatchScore(fields[fieldName], token);
            if (fieldScore > 0) {
                bestScore = Math.max(bestScore, fieldScore * weight);
            }
        });

        if (bestScore === 0) {
            return { matches: false, score: 0 };
        }

        score += bestScore;
    }

    return {
        matches: true,
        score
    };
}

function compareByCreatedAt(left, right, direction = 'desc') {
    const difference = getTimestamp(left) - getTimestamp(right);
    if (difference === 0) return 0;
    return direction === 'asc' ? difference : difference * -1;
}

export function filterAndSortGalleryItems(items, options = {}) {
    const sourceFilter = options.sourceFilter || 'all';
    const characterFilter = options.characterFilter || 'all';
    const searchQuery = String(options.searchQuery || '').trim();
    const sortOrder = options.sortOrder || 'newest';
    const parsedQuery = parseSearchQuery(searchQuery);
    const hasQuery =
        parsedQuery.generalTerms.length > 0 || Object.keys(parsedQuery.fieldFilters).length > 0;

    const filtered = (Array.isArray(items) ? items : [])
        .filter((item) => {
            if (sourceFilter !== 'all' && item.mediaSource !== sourceFilter) {
                return false;
            }

            if (characterFilter !== 'all' && item.characterId !== characterFilter) {
                return false;
            }

            return true;
        })
        .map((item) => {
            if (!hasQuery) {
                return { item, score: 0 };
            }

            const evaluation = evaluateGalleryItem(item, parsedQuery);
            return { item, score: evaluation.score, matches: evaluation.matches };
        })
        .filter((entry) => !hasQuery || entry.matches);

    filtered.sort((left, right) => {
        if (sortOrder === 'oldest') {
            return compareByCreatedAt(left.item, right.item, 'asc');
        }

        if (sortOrder === 'relevance' && hasQuery && right.score !== left.score) {
            return right.score - left.score;
        }

        return compareByCreatedAt(left.item, right.item, 'desc');
    });

    return filtered.map((entry) => entry.item);
}

export function parseGallerySearchQuery(query) {
    return parseSearchQuery(query);
}