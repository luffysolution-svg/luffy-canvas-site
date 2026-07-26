import "@testing-library/jest-dom/vitest";
import "fake-indexeddb/auto";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

afterEach(() => cleanup());

if (typeof window !== "undefined" && typeof globalThis.localStorage?.clear !== "function") {
    const createMemoryStorage = (): Storage => {
        const values = new Map<string, string>();
        return {
            get length() {
                return values.size;
            },
            clear: () => values.clear(),
            getItem: (key) => values.get(key) ?? null,
            key: (index) => Array.from(values.keys())[index] ?? null,
            removeItem: (key) => void values.delete(key),
            setItem: (key, value) => void values.set(key, String(value)),
        };
    };
    Object.defineProperty(window, "localStorage", { configurable: true, value: createMemoryStorage() });
    Object.defineProperty(window, "sessionStorage", { configurable: true, value: createMemoryStorage() });
    vi.stubGlobal("localStorage", window.localStorage);
    vi.stubGlobal("sessionStorage", window.sessionStorage);
}

if (!URL.createObjectURL) {
    Object.defineProperty(URL, "createObjectURL", {
        configurable: true,
        value: vi.fn(() => `blob:test-${crypto.randomUUID()}`),
    });
}

if (!URL.revokeObjectURL) {
    Object.defineProperty(URL, "revokeObjectURL", {
        configurable: true,
        value: vi.fn(),
    });
}
