import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { beforeEach, describe, expect, it } from 'vitest';

import {
    ReactAppStateProvider,
    useReactAppDispatch,
    useReactAppState
} from '../src/client/react-app-state.tsx';

function Probe() {
    const state = useReactAppState();
    const dispatch = useReactAppDispatch();

    return (
        <button
            type="button"
            data-status={state.legacyClientStatus}
            data-error={state.legacyClientError || ''}
            onClick={() => dispatch({ type: 'legacy-client/error', error: 'Boot failed.' })}
        >
            {state.legacyClientStatus}
        </button>
    );
}

describe('React app state provider', () => {
    beforeEach(() => {
        document.body.innerHTML = '<div id="root"></div>';
    });

    it('stores React shell state through a reducer', async () => {
        const host = document.getElementById('root');
        expect(host).not.toBeNull();
        const root = createRoot(host!);

        await act(async () => {
            root.render(
                <ReactAppStateProvider>
                    <Probe />
                </ReactAppStateProvider>
            );
        });

        const button = document.querySelector('button');
        expect(button).not.toBeNull();
        expect(button!.dataset.status).toBe('idle');

        await act(async () => {
            button!.click();
        });

        expect(button!.dataset.status).toBe('error');
        expect(button!.dataset.error).toBe('Boot failed.');
    });
});
