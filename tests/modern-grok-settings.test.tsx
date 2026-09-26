import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';
import { defaultSettings } from '../src/client/config.ts';
import { SettingsPanel } from '../src/client/modern/settings/SettingsPanel.tsx';
import type { ModernController } from '../src/client/modern/useModernController.ts';

afterEach(cleanup);
function controller(isAdmin: boolean) {
    return {
        user: { id: 1, username: 'tester', isAdmin },
        data: { settings: { ...defaultSettings } },
        updateSettings: vi.fn(),
        notify: vi.fn()
    } as unknown as ModernController;
}

it.each([true, false])(
    'lets users select and save Grok without an API key (admin: %s)',
    async (isAdmin) => {
        const control = controller(isAdmin);
        const user = userEvent.setup();
        render(<SettingsPanel controller={control} onClose={() => {}} />);
        await user.selectOptions(screen.getByLabelText('Provider'), 'grok-cli');
        expect(screen.queryByLabelText('OpenRouter API key')).not.toBeInTheDocument();
        await user.type(screen.getByLabelText('Grok model (optional)'), 'grok-build');
        await user.click(screen.getByRole('button', { name: /Save/ }));
        expect(control.updateSettings).toHaveBeenCalledWith(
            expect.objectContaining({
                textProvider: 'grok-cli',
                grokModel: 'grok-build',
                openrouterKey: ''
            })
        );
    }
);
