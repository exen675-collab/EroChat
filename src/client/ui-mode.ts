export type UiMode = 'modern' | 'legacy';

export interface BootstrapUser {
    id: number;
    username: string;
    credits: number;
    isAdmin: boolean;
}

const UI_MODE_KEY_PREFIX = 'erochat_ui_mode_user_';

export function getUiModeStorageKey(userId: number | string): string {
    return `${UI_MODE_KEY_PREFIX}${userId}`;
}

export function normalizeUiMode(value: unknown): UiMode {
    return value === 'legacy' ? 'legacy' : 'modern';
}

export function resolveUiMode(userId: number | string, storage: Storage = localStorage): UiMode {
    return normalizeUiMode(storage.getItem(getUiModeStorageKey(userId)));
}

export function setUiMode(
    userId: number | string,
    mode: UiMode,
    storage: Storage = localStorage
): void {
    storage.setItem(getUiModeStorageKey(userId), normalizeUiMode(mode));
}

export async function fetchBootstrapUser(): Promise<BootstrapUser | null> {
    try {
        const response = await fetch('/api/auth/me', { cache: 'no-store' });
        if (!response.ok) return null;
        const payload = await response.json();
        return payload?.user || null;
    } catch {
        return null;
    }
}

export function switchUiMode(userId: number | string, mode: UiMode): void {
    setUiMode(userId, mode);
    window.location.reload();
}
