import localforage from "localforage";
import type { StateStorage } from "zustand/middleware";

localforage.config({
    name: "infinite-canvas",
    storeName: "app_state",
});

export const localForageStorage: StateStorage = {
    getItem: async (name) => {
        if (typeof window === "undefined") return null;
        try {
            const value = await localforage.getItem<string>(name);
            return value ?? window.localStorage.getItem(name);
        } catch {
            return window.localStorage.getItem(name);
        }
    },
    setItem: async (name, value) => {
        if (typeof window === "undefined") return;
        try {
            await localforage.setItem(name, value);
        } catch {
            window.localStorage.setItem(name, value);
            return;
        }
        try {
            window.localStorage.removeItem(name);
        } catch {
            // IndexedDB already contains the authoritative value.
        }
    },
    removeItem: async (name) => {
        if (typeof window === "undefined") return;
        await localforage.removeItem(name).catch(() => undefined);
        try {
            window.localStorage.removeItem(name);
        } catch {
            // Best effort: the primary IndexedDB copy is already removed.
        }
    },
};
