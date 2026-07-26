import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";

import { defaultConfig, encodeChannelModel, type AiConfig, type ImageResponseFormat, type ModelChannel } from "@/stores/use-config-store";
import { ImageRequestUnknownError, requestGeneration } from "./image";

const PROVIDER_BASE_URL = "https://image-provider.test";
const GENERATION_URL = `${PROVIDER_BASE_URL}/v1/images/generations`;
const MODEL_NAME = "test-image-model";
const MODEL_VALUE = encodeChannelModel("test-channel", MODEL_NAME);
const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe("requestGeneration", () => {
    it("returns a URL-only result without fetching the remote image", async () => {
        const remoteUrl = "https://cdn.example.test/generated.png";
        let remoteFetches = 0;
        let requestBody: Record<string, unknown> = {};
        server.use(
            http.post(GENERATION_URL, async ({ request }) => {
                requestBody = (await request.json()) as Record<string, unknown>;
                return HttpResponse.json({
                    data: [{ url: remoteUrl }],
                    task_id: "task-1",
                    request_id: "request-1",
                    expires_at: 2_000_000_000,
                });
            }),
            http.get(remoteUrl, () => {
                remoteFetches += 1;
                return new HttpResponse(new Uint8Array([1, 2, 3]), { headers: { "Content-Type": "image/png" } });
            }),
        );

        const result = await requestGeneration(createConfig("url"), "一只猫");

        expect(requestBody.response_format).toBe("url");
        expect(result).toEqual([
            expect.objectContaining({
                status: "remote_only",
                source: "remote_url",
                remoteUrl,
                providerTaskId: "task-1",
                providerRequestId: "request-1",
                expiresAt: 2_000_000_000_000,
            }),
        ]);
        expect(remoteFetches).toBe(0);
    });

    it("normalizes a b64_json result to a data URL", async () => {
        let requestBody: Record<string, unknown> = {};
        server.use(
            http.post(GENERATION_URL, async ({ request }) => {
                requestBody = (await request.json()) as Record<string, unknown>;
                return HttpResponse.json({ data: [{ b64_json: "aW1hZ2U=" }] });
            }),
        );

        const result = await requestGeneration(createConfig("b64_json"), "一只猫");

        expect(requestBody.response_format).toBe("b64_json");
        expect(result).toEqual([
            expect.objectContaining({
                status: "generated",
                source: "data_url",
                dataUrl: "data:image/png;base64,aW1hZ2U=",
                mimeType: "image/png",
            }),
        ]);
    });

    it("requests Base64 when the response format is automatic", async () => {
        let requestBody: Record<string, unknown> = {};
        server.use(
            http.post(GENERATION_URL, async ({ request }) => {
                requestBody = (await request.json()) as Record<string, unknown>;
                return HttpResponse.json({ data: [{ b64_json: "YXV0bw==" }] });
            }),
        );

        const [result] = await requestGeneration(createConfig("auto"), "一只猫");

        expect(requestBody.response_format).toBe("b64_json");
        expect(result).toMatchObject({ status: "generated", source: "data_url", dataUrl: "data:image/png;base64,YXV0bw==" });
    });

    it("prefers URL when one item contains both URL and b64_json", async () => {
        const remoteUrl = "https://cdn.example.test/preferred.png";
        let remoteFetches = 0;
        server.use(
            http.post(GENERATION_URL, () => HttpResponse.json({ data: [{ url: remoteUrl, b64_json: "aW1hZ2U=" }] })),
            http.get(remoteUrl, () => {
                remoteFetches += 1;
                return new HttpResponse(new Uint8Array([1, 2, 3]), { headers: { "Content-Type": "image/png" } });
            }),
        );

        const [result] = await requestGeneration(createConfig("url"), "一只猫");

        expect(result).toMatchObject({ status: "remote_only", source: "remote_url", remoteUrl });
        expect(result).not.toHaveProperty("dataUrl");
        expect(remoteFetches).toBe(0);
    });

    it("keeps URL and Base64 items from the same response", async () => {
        const remoteUrl = "https://cdn.example.test/mixed.png";
        server.use(http.post(GENERATION_URL, () => HttpResponse.json({ data: [{ url: remoteUrl }, { b64_json: "bWl4ZWQ=" }] })));

        const result = await requestGeneration({ ...createConfig("url"), count: "2" }, "两只猫");

        expect(result).toHaveLength(2);
        expect(result[0]).toMatchObject({ status: "remote_only", source: "remote_url", remoteUrl });
        expect(result[1]).toMatchObject({ status: "generated", source: "data_url", dataUrl: "data:image/png;base64,bWl4ZWQ=" });
    });

    it("retries a 429 response and succeeds", async () => {
        let attempts = 0;
        server.use(
            http.post(GENERATION_URL, () => {
                attempts += 1;
                if (attempts === 1) {
                    return HttpResponse.json({ error: { message: "rate limited" } }, { status: 429, headers: { "Retry-After": "0" } });
                }
                return HttpResponse.json({ data: [{ b64_json: "cmV0cmllZA==" }] });
            }),
        );

        const result = await requestGeneration(createConfig("b64_json"), "一只猫");

        expect(attempts).toBe(2);
        expect(result[0]).toMatchObject({
            status: "generated",
            source: "data_url",
            dataUrl: "data:image/png;base64,cmV0cmllZA==",
        });
    });

    it("maps 504 to an unknown result without reporting CORS", async () => {
        server.use(http.post(GENERATION_URL, () => HttpResponse.json({ error: { message: "gateway timeout" } }, { status: 504 })));

        const error = await requestGeneration(createConfig("url"), "一只猫").then(
            () => null,
            (reason: unknown) => reason,
        );

        expect(error).toBeInstanceOf(ImageRequestUnknownError);
        expect(error).toMatchObject({
            resultUnknown: true,
            kind: "gateway",
            httpStatus: 504,
            failureStage: "provider_processing",
        });
        expect((error as Error).message).not.toMatch(/cors/i);
    });

    it("preserves metadata returned by a custom image script", async () => {
        const remoteUrl = "https://cdn.example.test/plugin.png";
        const config = createConfig("url");
        config.channels = config.channels.map((channel) => ({
            ...channel,
            models: channel.models.map((model) => ({
                ...model,
                scripts: {
                    image: `return [{ url: "${remoteUrl}", expiresAt: 2000000000, providerTaskId: "plugin-task", providerRequestId: "plugin-request" }];`,
                },
            })),
        }));

        const [result] = await requestGeneration(config, "插件生图");

        expect(result).toMatchObject({
            source: "remote_url",
            remoteUrl,
            expiresAt: 2_000_000_000_000,
            providerTaskId: "plugin-task",
            providerRequestId: "plugin-request",
        });
    });
});

function createConfig(imageResponseFormat: ImageResponseFormat): AiConfig {
    const channel: ModelChannel = {
        id: "test-channel",
        name: "测试渠道",
        provider: "openai-compatible",
        baseUrl: PROVIDER_BASE_URL,
        apiKey: "test-key",
        authType: "bearer",
        apiFormat: "openai",
        imageResponseFormat,
        imageBatchMode: "native",
        models: [{ name: MODEL_NAME, capabilities: ["image"] }],
    };
    return {
        ...defaultConfig,
        channels: [channel],
        models: [MODEL_VALUE],
        model: MODEL_VALUE,
        imageModel: MODEL_VALUE,
        count: "1",
    };
}
