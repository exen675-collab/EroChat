import crypto from 'node:crypto';

export function jsonOrNull(text) {
    if (!text) return null;
    try {
        return JSON.parse(text);
    } catch {
        return null;
    }
}

export function parseJsonArray(value) {
    if (Array.isArray(value)) {
        return value;
    }
    if (typeof value !== 'string' || !value.trim()) {
        return [];
    }
    const parsed = jsonOrNull(value);
    return Array.isArray(parsed) ? parsed : [];
}

export function parseJsonObject(value) {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
        return value;
    }
    if (typeof value !== 'string' || !value.trim()) {
        return {};
    }
    const parsed = jsonOrNull(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
}

export function stringifyJson(value, fallback) {
    return JSON.stringify(value ?? fallback);
}

export function generateId() {
    if (typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID();
    }
    return crypto.randomBytes(16).toString('hex');
}

export function limitedText(value, maxLength, required = false) {
    const text = typeof value === 'string' ? value.trim() : '';
    if (required && !text) return null;
    return text.slice(0, maxLength);
}

export function normalizePositiveInt(value, fallback, min = 1, max = 100) {
    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.min(max, Math.max(min, parsed));
}

export function normalizeIntegerArray(value) {
    return Array.from(
        new Set(
            parseJsonArray(value)
                .map((item) => Number.parseInt(item, 10))
                .filter((item) => Number.isFinite(item) && item > 0)
        )
    );
}
