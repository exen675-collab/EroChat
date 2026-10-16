import path from 'node:path';

export const ROOT_DIR = path.resolve(__dirname, '../..');
export const DATA_DIR =
    process.env.NODE_ENV === 'test' && process.env.EROCHAT_TEST_DATA_DIR
        ? path.resolve(process.env.EROCHAT_TEST_DATA_DIR)
        : path.join(ROOT_DIR, 'data');
export const MEDIA_DIR = path.join(DATA_DIR, 'media');
export const DB_PATH = path.join(DATA_DIR, 'erochat.sqlite');
export const PORT = Number(process.env.PORT || 20121);
export const SESSION_SECRET = process.env.SESSION_SECRET || 'change-this-secret';
export const COOKIE_SECURE = process.env.COOKIE_SECURE === 'true';
// Anyone who can reach the server may create an account unless this is set to false.
export const SIGNUP_ENABLED = process.env.ALLOW_SIGNUP !== 'false';

export const MAX_JSON_BODY_BYTES = '25mb';
export const MAX_INLINE_MEDIA_BYTES = 10 * 1024 * 1024;
export const MAX_UPLOADED_MEDIA_BYTES = 80 * 1024 * 1024;
export const MAX_REMOTE_MEDIA_BYTES = 80 * 1024 * 1024;
export const DEFAULT_ADMIN_USERNAME = 'admin';
export const DEFAULT_ADMIN_PASSWORD = 'admin';
export const OPENROUTER_CHAT_COMPLETIONS_URL =
    process.env.NODE_ENV === 'test' && process.env.EROCHAT_TEST_OPENROUTER_URL
        ? process.env.EROCHAT_TEST_OPENROUTER_URL
        : 'https://openrouter.ai/api/v1/chat/completions';
const configuredCharacterGenerationTimeout = Number.parseInt(
    process.env.EROCHAT_TEST_CHARACTER_GENERATION_TIMEOUT_MS || '',
    10
);
export const ADMIN_CHARACTER_GENERATION_TIMEOUT_MS =
    process.env.NODE_ENV === 'test' &&
    Number.isFinite(configuredCharacterGenerationTimeout) &&
    configuredCharacterGenerationTimeout > 0
        ? configuredCharacterGenerationTimeout
        : 120 * 1000;
export const ADMIN_CHARACTER_REFERENCE_LIMIT = 120;
export const ADMIN_CHARACTER_BRIEF_MAX_LENGTH = 2000;

export const LOGIN_RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
export const LOGIN_RATE_LIMIT_MAX_ATTEMPTS = 20;

function getIntEnv(name, fallback) {
    const raw = process.env[name];
    if (raw == null || raw === '') return fallback;
    const parsed = Number.parseInt(raw, 10);
    return Number.isFinite(parsed) ? parsed : fallback;
}

export const DEFAULT_USER_CREDITS = getIntEnv('DEFAULT_USER_CREDITS', 100);
