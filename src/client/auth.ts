export interface BootstrapUser {
    id: number;
    username: string;
    credits: number;
    isAdmin: boolean;
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
