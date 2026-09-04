import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { useDatabaseState } from '../src/client/modern/useDatabaseState.js';
import {
    createModernDefaultState,
    getModernStorageKey,
    loadModernState
} from '../src/client/modern/storage.js';

afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    localStorage.clear();
});

it('uploads the exact legacy payload without writing or removing localStorage', async () => {
    const raw = JSON.stringify({ ...createModernDefaultState(), custom: 'preserve' }, null, 2);
    localStorage.setItem(getModernStorageKey(7), raw);
    const fetchMock = vi.fn(
        async () => new Response(JSON.stringify({ state: JSON.parse(raw), revision: 1 }))
    );
    vi.stubGlobal('fetch', fetchMock);
    await loadModernState(7);
    expect(JSON.parse(String((fetchMock.mock.calls[0] as any)[1].body)).localState).toBe(raw);
    expect(localStorage.getItem(getModernStorageKey(7))).toBe(raw);
});

it('never saves defaults after a failed load and supports retry', async () => {
    const fetchMock = vi
        .fn()
        .mockRejectedValueOnce(new Error('offline'))
        .mockResolvedValue(new Response(JSON.stringify({ state: null, revision: 0 })));
    vi.stubGlobal('fetch', fetchMock);
    const { result } = renderHook(() => useDatabaseState(7));
    await waitFor(() => expect(result.current.persistence.error).toBe('offline'));
    expect(result.current.persistence.loaded).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    act(() => result.current.persistence.retry());
    await waitFor(() => expect(result.current.persistence.loaded).toBe(true));
});

it('serializes writes and keeps the latest changes pending during a save', async () => {
    let finish: (response: Response) => void = () => {};
    const writes: any[] = [];
    vi.stubGlobal(
        'fetch',
        vi.fn(async (url: string, init: RequestInit) => {
            if (url.endsWith('/load'))
                return new Response(JSON.stringify({ state: null, revision: 0 }));
            writes.push(JSON.parse(String(init.body)));
            if (writes.length === 1)
                return new Promise<Response>((resolve) => {
                    finish = resolve;
                });
            return new Response(JSON.stringify({ revision: 2 }));
        })
    );
    const { result } = renderHook(() => useDatabaseState(7));
    await waitFor(() => expect(result.current.persistence.loaded).toBe(true));
    act(() => result.current.setData((state) => ({ ...state, gallerySearchQuery: 'first' })));
    await waitFor(() => expect(writes.length).toBe(1));
    act(() => result.current.setData((state) => ({ ...state, gallerySearchQuery: 'latest' })));
    await act(async () => {
        finish(new Response(JSON.stringify({ revision: 1 })));
    });
    await waitFor(() => expect(writes.length).toBe(2));
    expect(writes[1].revision).toBe(1);
    expect(writes[1].state.gallerySearchQuery).toBe('latest');
});
