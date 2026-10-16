import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { Modal } from '../src/client/modern/components/ui.js';

function Harness({ withField }: { withField: boolean }) {
    const [open, setOpen] = useState(false);
    return (
        <>
            <button onClick={() => setOpen(true)}>Open dialog</button>
            {open && (
                <Modal title="Example" onClose={() => setOpen(false)}>
                    {withField ? <textarea aria-label="Notes" /> : <p>Read only.</p>}
                </Modal>
            )}
        </>
    );
}

describe('Modal focus', () => {
    afterEach(cleanup);

    it('focuses the first field and returns focus to the opener on close', async () => {
        render(<Harness withField />);
        const opener = screen.getByRole('button', { name: 'Open dialog' });
        await userEvent.click(opener);
        expect(screen.getByRole('textbox', { name: 'Notes' })).toHaveFocus();
        await userEvent.keyboard('{Escape}');
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
        expect(opener).toHaveFocus();
    });

    it('focuses the dialog itself when it has no fields', async () => {
        render(<Harness withField={false} />);
        await userEvent.click(screen.getByRole('button', { name: 'Open dialog' }));
        expect(screen.getByRole('dialog', { name: 'Example' })).toHaveFocus();
    });
});
