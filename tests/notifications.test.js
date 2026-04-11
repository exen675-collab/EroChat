import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('notifications helpers', () => {
    beforeEach(() => {
        vi.resetModules();
        document.body.innerHTML = '';
    });

    it('renders toast actions and runs the selected callback', async () => {
        const onRetry = vi.fn();
        const { showToast } = await import('../js/notifications.js');

        showToast('Model fetch failed.', {
            type: 'error',
            actionLabel: 'Retry',
            onAction: onRetry,
            persistent: true
        });

        expect(document.getElementById('appToastViewport')).not.toBeNull();
        const retryButton = Array.from(document.querySelectorAll('button')).find(
            (button) => button.textContent === 'Retry'
        );
        expect(retryButton).not.toBeUndefined();

        retryButton.click();

        expect(onRetry).toHaveBeenCalledTimes(1);
        expect(document.getElementById('appToastViewport')?.children).toHaveLength(0);
    });

    it('resolves confirmation promises from toast actions', async () => {
        const { requestConfirmation } = await import('../js/notifications.js');

        const confirmation = requestConfirmation('Delete this character?', {
            confirmLabel: 'Delete',
            type: 'error'
        });

        const deleteButton = Array.from(document.querySelectorAll('button')).find(
            (button) => button.textContent === 'Delete'
        );
        expect(deleteButton).not.toBeUndefined();

        deleteButton.click();

        await expect(confirmation).resolves.toBe(true);
    });

    it('replaces blocking alerts with toasts', async () => {
        const { installAlertNotificationOverrides } = await import('../js/notifications.js');

        installAlertNotificationOverrides();
        window.alert('Settings saved.');

        expect(document.getElementById('appToastViewport')?.textContent).toContain('Settings saved.');
    });
});
