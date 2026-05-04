import { act } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

async function waitFor(assertion: () => void) {
    const startedAt = Date.now();
    let lastError: unknown;

    while (Date.now() - startedAt < 1000) {
        try {
            assertion();
            return;
        } catch (error) {
            lastError = error;
            await new Promise((resolve) => setTimeout(resolve, 20));
        }
    }

    throw lastError;
}

describe('React app entry', () => {
    beforeEach(() => {
        vi.resetModules();
        globalThis.IS_REACT_ACT_ENVIRONMENT = true;
        document.body.innerHTML = '<div id="root"></div>';

        vi.stubGlobal(
            'localStorage',
            {
                getItem: vi.fn(() => null),
                setItem: vi.fn(),
                removeItem: vi.fn()
            } satisfies Partial<Storage>
        );

        vi.stubGlobal(
            'fetch',
            vi.fn(async (input: RequestInfo | URL) => {
                const url = String(input);
                if (url === '/api/auth/me') {
                    return {
                        ok: true,
                        json: async () => ({
                            user: { username: 'adam', credits: 42, isAdmin: false }
                        })
                    } as Response;
                }
                return {
                    ok: true,
                    json: async () => ({})
                } as Response;
            })
        );

        vi.stubGlobal(
            'ResizeObserver',
            class {
                observe() {}
                disconnect() {}
            }
        );
    });

    it('mounts the legacy app DOM and starts client listeners', async () => {
        await act(async () => {
            await import('../src/client/app-entry.tsx');
            await Promise.resolve();
            await Promise.resolve();
        });

        await waitFor(() => {
            expect(document.getElementById('settingsPanel')).not.toBeNull();
            expect(document.getElementById('currentUsername')?.textContent).toContain('@adam');
        });

        document.getElementById('navGeneratorBtn')?.click();

        expect(document.getElementById('generatorView')?.classList.contains('hidden')).toBe(false);
        expect(document.getElementById('chatView')?.classList.contains('hidden')).toBe(true);
    });
});
