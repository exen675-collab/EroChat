import { createContext, Dispatch, ReactNode, useContext, useReducer } from 'react';

type ReactAppState = {
    legacyClientStatus: 'idle' | 'loading' | 'ready' | 'error';
    legacyClientError: string | null;
};

type ReactAppAction =
    | { type: 'legacy-client/loading' }
    | { type: 'legacy-client/ready' }
    | { type: 'legacy-client/error'; error: string };

const initialState: ReactAppState = {
    legacyClientStatus: 'idle',
    legacyClientError: null
};

const ReactAppStateContext = createContext<ReactAppState | null>(null);
const ReactAppDispatchContext = createContext<Dispatch<ReactAppAction> | null>(null);

function reducer(state: ReactAppState, action: ReactAppAction): ReactAppState {
    switch (action.type) {
        case 'legacy-client/loading':
            return { ...state, legacyClientStatus: 'loading', legacyClientError: null };
        case 'legacy-client/ready':
            return { ...state, legacyClientStatus: 'ready', legacyClientError: null };
        case 'legacy-client/error':
            return { ...state, legacyClientStatus: 'error', legacyClientError: action.error };
        default:
            return state;
    }
}

export function ReactAppStateProvider({ children }: { children: ReactNode }) {
    const [state, dispatch] = useReducer(reducer, initialState);

    return (
        <ReactAppStateContext.Provider value={state}>
            <ReactAppDispatchContext.Provider value={dispatch}>
                {children}
            </ReactAppDispatchContext.Provider>
        </ReactAppStateContext.Provider>
    );
}

export function useReactAppState() {
    const state = useContext(ReactAppStateContext);
    if (!state) {
        throw new Error('useReactAppState must be used inside ReactAppStateProvider.');
    }
    return state;
}

export function useReactAppDispatch() {
    const dispatch = useContext(ReactAppDispatchContext);
    if (!dispatch) {
        throw new Error('useReactAppDispatch must be used inside ReactAppStateProvider.');
    }
    return dispatch;
}
