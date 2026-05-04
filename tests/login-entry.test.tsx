import { act } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('React login entry', () => {
    beforeEach(() => {
        vi.resetModules();
        document.body.innerHTML = '<div id="root"></div>';
    });

    it('renders login and signup forms', async () => {
        await act(async () => {
            await import('../src/client/login-entry.tsx');
        });

        expect(document.body.textContent).toContain('Log In');
        expect(document.body.textContent).toContain('Create Account');
        expect(document.querySelectorAll('form')).toHaveLength(2);
    });

    it('shows API errors without leaving the page', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn(async () => ({
                ok: false,
                json: async () => ({ error: 'Invalid credentials.' })
            }))
        );

        await act(async () => {
            await import('../src/client/login-entry.tsx');
        });

        const form = document.querySelector('form');
        expect(form).not.toBeNull();

        const username = form?.querySelector<HTMLInputElement>('input[name="username"]');
        const password = form?.querySelector<HTMLInputElement>('input[name="password"]');
        expect(username).not.toBeNull();
        expect(password).not.toBeNull();

        username!.value = 'adam';
        password!.value = 'wrong-password';

        await act(async () => {
            form!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
        });

        expect(fetch).toHaveBeenCalledWith(
            '/api/auth/login',
            expect.objectContaining({ method: 'POST' })
        );
        expect(document.body.textContent).toContain('Invalid credentials.');
    });
});
