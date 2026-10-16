// Under the current jsdom + Vitest combination, `localStorage` is exposed on the
// window but resolves to undefined, so every test that reads per-user state fails
// before it starts. Install a Web Storage stand-in only when the environment has no
// working implementation; real browsers and correctly configured jsdom are untouched.
// Node-environment tests have no window and skip this entirely.
class MemoryStorage implements Storage {
    private items = new Map<string, string>();

    get length() {
        return this.items.size;
    }

    clear() {
        this.items.clear();
    }

    getItem(key: string) {
        return this.items.has(String(key)) ? this.items.get(String(key)) : null;
    }

    key(index: number) {
        return Array.from(this.items.keys())[index] ?? null;
    }

    removeItem(key: string) {
        this.items.delete(String(key));
    }

    setItem(key: string, value: string) {
        this.items.set(String(key), String(value));
    }
}

if (typeof window !== 'undefined' && typeof window.localStorage === 'undefined') {
    const storage = new MemoryStorage();
    Object.defineProperty(window, 'localStorage', { value: storage, configurable: true });
    Object.defineProperty(globalThis, 'localStorage', { value: storage, configurable: true });
}
