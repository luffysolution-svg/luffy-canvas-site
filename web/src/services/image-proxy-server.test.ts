// @vitest-environment node

import { describe, expect, it, vi } from "vitest";

import { createImageProxyHandler } from "../../../server/image-proxy";

const APP_ORIGIN = "https://canvas.example";
const SOURCE_URL = "https://images.example/result.png?token=secret";
const publicLookup = vi.fn(async () => [{ address: "93.184.216.34", family: 4 }]);

function proxyRequest(url = SOURCE_URL, origin = APP_ORIGIN) {
    return new Request(`${APP_ORIGIN}/api/images/proxy`, {
        method: "POST",
        headers: {
            "content-type": "application/json",
            origin,
        },
        body: JSON.stringify({ url }),
    });
}

function imageResponse(body: BodyInit = new Uint8Array([1, 2, 3]), headers: Record<string, string> = {}) {
    return new Response(body, { headers: { "content-type": "image/png", ...headers } });
}

describe("image proxy server", () => {
    it("fails closed when no result hosts are configured", async () => {
        const fetchImpl = vi.fn();
        const handle = createImageProxyHandler({ allowedHosts: [], fetchImpl: fetchImpl as typeof fetch, lookupHost: publicLookup });

        const response = await handle(proxyRequest());

        expect(response.status).toBe(503);
        expect(fetchImpl).not.toHaveBeenCalled();
    });

    it("rejects malformed and non-HTTPS result URLs", async () => {
        const fetchImpl = vi.fn();
        const handle = createImageProxyHandler({ allowedHosts: ["images.example"], fetchImpl: fetchImpl as typeof fetch, lookupHost: publicLookup });

        await expect(handle(proxyRequest("not-a-url"))).resolves.toMatchObject({ status: 400 });
        await expect(handle(proxyRequest("http://images.example/result.png"))).resolves.toMatchObject({ status: 400 });
        expect(fetchImpl).not.toHaveBeenCalled();
    });

    it("rejects cross-origin callers and IP-literal targets", async () => {
        const fetchImpl = vi.fn();
        const handle = createImageProxyHandler({ allowedHosts: ["images.example"], fetchImpl: fetchImpl as typeof fetch, lookupHost: publicLookup });

        await expect(handle(proxyRequest(SOURCE_URL, "https://other.example"))).resolves.toMatchObject({ status: 403 });
        await expect(handle(proxyRequest("https://127.0.0.1/result.png"))).resolves.toMatchObject({ status: 403 });
        expect(fetchImpl).not.toHaveBeenCalled();
    });

    it("rejects an allowed hostname when DNS resolves to a private address", async () => {
        const fetchImpl = vi.fn();
        const handle = createImageProxyHandler({
            allowedHosts: ["images.example"],
            fetchImpl: fetchImpl as typeof fetch,
            lookupHost: async () => [{ address: "10.0.0.8", family: 4 }],
        });

        const response = await handle(proxyRequest());

        expect(response.status).toBe(403);
        expect(fetchImpl).not.toHaveBeenCalled();
    });

    it.each(["64:ff9b::a00:8", "2002:a00:8::"])("rejects an IPv6 address that can encode a private IPv4 target: %s", async (address) => {
        const fetchImpl = vi.fn();
        const handle = createImageProxyHandler({
            allowedHosts: ["images.example"],
            fetchImpl: fetchImpl as typeof fetch,
            lookupHost: async () => [{ address, family: 6 }],
        });

        const response = await handle(proxyRequest());

        expect(response.status).toBe(403);
        expect(fetchImpl).not.toHaveBeenCalled();
    });

    it("revalidates every redirect before requesting the next host", async () => {
        const fetchImpl = vi.fn().mockResolvedValue(new Response(null, { status: 302, headers: { location: "https://blocked.example/private.png" } }));
        const handle = createImageProxyHandler({ allowedHosts: ["images.example"], fetchImpl: fetchImpl as typeof fetch, lookupHost: publicLookup });

        const response = await handle(proxyRequest());

        expect(response.status).toBe(403);
        expect(fetchImpl).toHaveBeenCalledOnce();
    });

    it("streams a redirect when both result hosts are explicitly allowed", async () => {
        const fetchImpl = vi
            .fn()
            .mockResolvedValueOnce(new Response(null, { status: 302, headers: { location: "https://cdn.example/final.png" } }))
            .mockResolvedValueOnce(imageResponse());
        const lookupHost = vi.fn(publicLookup);
        const handle = createImageProxyHandler({
            allowedHosts: ["images.example", "cdn.example"],
            fetchImpl: fetchImpl as typeof fetch,
            lookupHost,
        });

        const response = await handle(proxyRequest());

        expect(response.status).toBe(200);
        expect(await response.arrayBuffer()).toEqual(new Uint8Array([1, 2, 3]).buffer);
        expect(fetchImpl).toHaveBeenCalledTimes(2);
        expect(lookupHost).toHaveBeenCalledTimes(2);
    });

    it("rejects non-raster responses without echoing the signed URL", async () => {
        const fetchImpl = vi.fn().mockResolvedValue(new Response("<svg/>", { headers: { "content-type": "image/svg+xml" } }));
        const handle = createImageProxyHandler({ allowedHosts: ["images.example"], fetchImpl: fetchImpl as typeof fetch, lookupHost: publicLookup });

        const response = await handle(proxyRequest());
        const body = await response.text();

        expect(response.status).toBe(415);
        expect(body).not.toContain(SOURCE_URL);
        expect(body).not.toContain("secret");
    });

    it("rejects a declared image larger than the configured limit", async () => {
        const fetchImpl = vi.fn().mockResolvedValue(imageResponse(undefined, { "content-length": "1025" }));
        const handle = createImageProxyHandler({
            allowedHosts: ["images.example"],
            fetchImpl: fetchImpl as typeof fetch,
            lookupHost: publicLookup,
            maxBytes: 1024,
        });

        const response = await handle(proxyRequest());

        expect(response.status).toBe(413);
    });

    it("streams an image larger than Vercel's buffered response limit", async () => {
        const chunk = new Uint8Array(3 * 1024 * 1024);
        const upstreamBody = new ReadableStream<Uint8Array>({
            start(controller) {
                controller.enqueue(chunk);
                controller.enqueue(chunk);
                controller.close();
            },
        });
        const fetchImpl = vi.fn().mockResolvedValue(imageResponse(upstreamBody));
        const handle = createImageProxyHandler({
            allowedHosts: ["images.example"],
            fetchImpl: fetchImpl as typeof fetch,
            lookupHost: publicLookup,
            maxBytes: 8 * 1024 * 1024,
        });

        const response = await handle(proxyRequest());

        expect(response.status).toBe(200);
        expect(response.headers.get("content-length")).toBeNull();
        expect((await response.arrayBuffer()).byteLength).toBe(6 * 1024 * 1024);
    });

    it("aborts an unknown-length stream when it crosses the configured limit", async () => {
        const upstreamBody = new ReadableStream<Uint8Array>({
            start(controller) {
                controller.enqueue(new Uint8Array(700));
                controller.enqueue(new Uint8Array(700));
                controller.close();
            },
        });
        const fetchImpl = vi.fn().mockResolvedValue(imageResponse(upstreamBody));
        const handle = createImageProxyHandler({
            allowedHosts: ["images.example"],
            fetchImpl: fetchImpl as typeof fetch,
            lookupHost: publicLookup,
            maxBytes: 1024,
        });

        const response = await handle(proxyRequest());

        expect(response.status).toBe(200);
        await expect(response.arrayBuffer()).rejects.toThrow("size limit");
    });
});
