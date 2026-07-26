import "@testing-library/jest-dom/vitest";
import "fake-indexeddb/auto";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

afterEach(() => cleanup());

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
