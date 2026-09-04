import { useCallback, useEffect, useRef, useState } from 'react';
import {
    createModernDefaultState,
    loadModernState,
    persistModernState,
    serializeModernState
} from './storage.js';
import type { ModernPersistedState } from './types.js';

export function useDatabaseState(userId: number | string) {
    const [data, setData] = useState(createModernDefaultState);
    const [loaded, setLoaded] = useState(false);
    const [error, setError] = useState('');
    const [saving, setSaving] = useState(false);
    const [attempt, setAttempt] = useState(0);
    const session = useRef({
        revision: 0,
        saved: '',
        pending: null as ModernPersistedState | null,
        running: false,
        stopped: false
    });

    useEffect(() => {
        let cancelled = false;
        setLoaded(false);
        setError('');
        const current = {
            revision: 0,
            saved: '',
            pending: null as ModernPersistedState | null,
            running: false,
            stopped: false
        };
        session.current = current;
        void loadModernState(userId)
            .then(({ state, revision }) => {
                if (cancelled) return;
                current.revision = revision;
                current.saved = revision === 0 ? '' : serializeModernState(state);
                const hash = window.location.hash.slice(1);
                if (
                    ['chat', 'characters', 'browse', 'generator', 'gallery', 'stats'].includes(hash)
                ) {
                    state = { ...state, currentView: hash as ModernPersistedState['currentView'] };
                }
                setData(state);
                setLoaded(true);
            })
            .catch((reason) => {
                if (!cancelled) setError(String(reason.message || reason));
            });
        return () => {
            cancelled = true;
            current.stopped = true;
        };
    }, [userId, attempt]);

    useEffect(() => {
        if (loaded) session.current.pending = data;
    }, [data, loaded]);

    const flush = useCallback(async () => {
        const current = session.current;
        if (current.running || current.stopped || !current.pending) return;
        const next = current.pending;
        const serialized = serializeModernState(next);
        if (serialized === current.saved) return;
        current.running = true;
        setSaving(true);
        try {
            current.revision = await persistModernState(next, current.revision);
            current.saved = serialized;
            if (!current.stopped) setError('');
        } catch (reason) {
            if (!current.stopped) setError((reason as Error).message);
        } finally {
            current.running = false;
            if (!current.stopped) setSaving(false);
        }
    }, []);

    useEffect(() => {
        if (!loaded || error) return;
        const timer = window.setInterval(() => {
            void flush();
        }, 500);
        return () => window.clearInterval(timer);
    }, [loaded, error, flush]);

    useEffect(() => {
        const beforeUnload = (event: BeforeUnloadEvent) => {
            const current = session.current;
            if (current.pending && serializeModernState(current.pending) !== current.saved) {
                event.preventDefault();
                event.returnValue = '';
            }
        };
        const onHidden = () => {
            if (document.visibilityState === 'hidden') void flush();
        };
        window.addEventListener('beforeunload', beforeUnload);
        document.addEventListener('visibilitychange', onHidden);
        return () => {
            window.removeEventListener('beforeunload', beforeUnload);
            document.removeEventListener('visibilitychange', onHidden);
        };
    }, [flush]);

    const retry = () => {
        if (loaded) {
            setError('');
            void flush();
        } else setAttempt((value) => value + 1);
    };
    const download = () => {
        const url = URL.createObjectURL(
            new Blob([serializeModernState(data)], { type: 'application/json' })
        );
        const link = document.createElement('a');
        link.href = url;
        link.download = `erochat-user-${userId}-recovery.json`;
        link.click();
        window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    };
    return { data, setData, persistence: { loaded, error, saving, retry, download } };
}
