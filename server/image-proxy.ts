import { lookup } from "node:dns/promises";
import { BlockList, isIP } from "node:net";

const DEFAULT_MAX_BYTES = 64 * 1024 * 1024;
const DEFAULT_TIMEOUT_MS = 55_000;
const MAX_REDIRECTS = 3;
const MAX_REQUEST_BYTES = 8 * 1024;
const ALLOWED_IMAGE_TYPES = new Set([
  "image/avif",
  "image/gif",
  "image/jpeg",
  "image/png",
  "image/webp",
]);
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

type LookupAddress = { address: string; family: number };

export type ImageProxyOptions = {
  allowedHosts?: Iterable<string>;
  fetchImpl?: typeof fetch;
  lookupHost?: (hostname: string) => Promise<LookupAddress[]>;
  maxBytes?: number;
  timeoutMs?: number;
};

class ImageProxyError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

const blockedAddresses = createBlockedAddressList();

export function createImageProxyHandler(options: ImageProxyOptions = {}) {
  return async function handleImageProxyRequest(
    request: Request,
  ): Promise<Response> {
    try {
      if (request.method !== "POST")
        throw new ImageProxyError(
          405,
          "method_not_allowed",
          "仅支持 POST 请求",
        );
      validateOrigin(request);
      validateRequestContentType(request);

      const contentLength = Number(request.headers.get("content-length") || 0);
      if (contentLength > MAX_REQUEST_BYTES)
        throw new ImageProxyError(413, "request_too_large", "代理请求体过大");

      const rawBody = await request.text();
      if (rawBody.length > MAX_REQUEST_BYTES)
        throw new ImageProxyError(413, "request_too_large", "代理请求体过大");

      const sourceUrl = readSourceUrl(rawBody);
      const allowedHosts = normalizeAllowedHosts(
        options.allowedHosts ?? readAllowedHosts(),
      );
      if (!allowedHosts.size)
        throw new ImageProxyError(
          503,
          "proxy_not_configured",
          "图片代理尚未配置可访问的结果域名",
        );

      return await fetchImage(sourceUrl, allowedHosts, options, request.signal);
    } catch (error) {
      return errorResponse(error);
    }
  };
}

async function fetchImage(
  sourceUrl: string,
  allowedHosts: Set<string>,
  options: ImageProxyOptions,
  clientSignal: AbortSignal,
) {
  const fetchImpl = options.fetchImpl ?? fetch;
  const lookupHost = options.lookupHost ?? defaultLookup;
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const abortController = new AbortController();
  const timeout = setTimeout(
    () => abortController.abort(new Error("image proxy timeout")),
    timeoutMs,
  );
  const abortFromClient = () => abortController.abort(clientSignal.reason);
  if (clientSignal.aborted) abortFromClient();
  else clientSignal.addEventListener("abort", abortFromClient, { once: true });
  const cleanup = once(() => {
    clearTimeout(timeout);
    clientSignal.removeEventListener("abort", abortFromClient);
  });

  try {
    let currentUrl = new URL(sourceUrl);
    for (let redirectCount = 0; ; redirectCount += 1) {
      await validateTarget(currentUrl, allowedHosts, lookupHost);
      const upstream = await fetchImpl(currentUrl, {
        method: "GET",
        headers: {
          accept: "image/avif,image/webp,image/png,image/jpeg,image/gif;q=0.9",
        },
        redirect: "manual",
        signal: abortController.signal,
      });

      if (REDIRECT_STATUSES.has(upstream.status)) {
        if (redirectCount >= MAX_REDIRECTS) {
          await cancelBody(upstream.body);
          throw new ImageProxyError(
            502,
            "too_many_redirects",
            "图片地址重定向次数过多",
          );
        }
        const location = upstream.headers.get("location");
        await cancelBody(upstream.body);
        if (!location)
          throw new ImageProxyError(
            502,
            "invalid_redirect",
            "图片服务返回了无效重定向",
          );
        currentUrl = new URL(location, currentUrl);
        continue;
      }

      if (!upstream.ok) {
        await cancelBody(upstream.body);
        throw new ImageProxyError(
          502,
          "upstream_error",
          `图片服务返回异常状态（${upstream.status}）`,
        );
      }

      let mimeType: string;
      let declaredBytes: number | undefined;
      try {
        mimeType = readImageMimeType(upstream.headers.get("content-type"));
        declaredBytes = readContentLength(
          upstream.headers.get("content-length"),
        );
      } catch (error) {
        await cancelBody(upstream.body);
        throw error;
      }
      if (declaredBytes !== undefined && declaredBytes > maxBytes) {
        await cancelBody(upstream.body);
        throw new ImageProxyError(
          413,
          "image_too_large",
          "远程图片超过代理大小限制",
        );
      }
      if (!upstream.body)
        throw new ImageProxyError(
          502,
          "empty_response",
          "图片服务未返回可读取的内容",
        );

      return new Response(limitStream(upstream.body, maxBytes, cleanup), {
        status: 200,
        headers: {
          "cache-control": "private, no-store",
          "content-type": mimeType,
          "cross-origin-resource-policy": "same-origin",
          "x-content-type-options": "nosniff",
        },
      });
    }
  } catch (error) {
    cleanup();
    if (error instanceof ImageProxyError) throw error;
    if (abortController.signal.aborted)
      throw new ImageProxyError(504, "proxy_timeout", "远程图片下载超时");
    throw new ImageProxyError(502, "proxy_fetch_failed", "远程图片下载失败");
  }
}

function validateOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin || origin !== new URL(request.url).origin)
    throw new ImageProxyError(
      403,
      "invalid_origin",
      "仅允许当前站点请求图片代理",
    );
}

function validateRequestContentType(request: Request) {
  const contentType = request.headers
    .get("content-type")
    ?.split(";", 1)[0]
    .trim()
    .toLowerCase();
  if (contentType !== "application/json")
    throw new ImageProxyError(
      415,
      "invalid_content_type",
      "代理请求必须使用 JSON",
    );
}

function readSourceUrl(rawBody: string) {
  let body: unknown;
  try {
    body = JSON.parse(rawBody);
  } catch {
    throw new ImageProxyError(400, "invalid_json", "代理请求不是有效 JSON");
  }
  const url =
    typeof body === "object" && body !== null && "url" in body
      ? (body as { url?: unknown }).url
      : undefined;
  if (typeof url !== "string" || !url || url.length > MAX_REQUEST_BYTES)
    throw new ImageProxyError(400, "invalid_url", "缺少有效的图片 URL");
  try {
    new URL(url);
  } catch {
    throw new ImageProxyError(400, "invalid_url", "图片 URL 格式无效");
  }
  return url;
}

async function validateTarget(
  url: URL,
  allowedHosts: Set<string>,
  lookupHost: (hostname: string) => Promise<LookupAddress[]>,
) {
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    (url.port && url.port !== "443")
  ) {
    throw new ImageProxyError(
      400,
      "invalid_url",
      "图片地址必须是标准 HTTPS 地址",
    );
  }

  const hostname = normalizeHostname(url.hostname);
  if (
    !hostname ||
    isIP(hostname) ||
    hostname === "localhost" ||
    !allowedHosts.has(hostname)
  ) {
    throw new ImageProxyError(
      403,
      "host_not_allowed",
      "图片结果域名未被代理允许",
    );
  }

  let addresses: LookupAddress[];
  try {
    addresses = await lookupHost(hostname);
  } catch {
    throw new ImageProxyError(502, "dns_failed", "图片结果域名解析失败");
  }
  if (
    !addresses.length ||
    addresses.some(({ address, family }) => !isPublicAddress(address, family))
  ) {
    throw new ImageProxyError(
      403,
      "private_address",
      "图片结果域名解析到了非公网地址",
    );
  }
}

function readImageMimeType(value: string | null) {
  const mimeType = value?.split(";", 1)[0].trim().toLowerCase() || "";
  if (!ALLOWED_IMAGE_TYPES.has(mimeType))
    throw new ImageProxyError(
      415,
      "unsupported_image_type",
      "远程地址返回的不是受支持的图片",
    );
  return mimeType;
}

function readContentLength(value: string | null) {
  if (!value) return undefined;
  if (!/^\d+$/.test(value))
    throw new ImageProxyError(
      502,
      "invalid_content_length",
      "图片服务返回了无效文件大小",
    );
  const bytes = Number(value);
  if (!Number.isSafeInteger(bytes))
    throw new ImageProxyError(
      502,
      "invalid_content_length",
      "图片服务返回了无效文件大小",
    );
  return bytes;
}

function limitStream(
  body: ReadableStream<Uint8Array>,
  maxBytes: number,
  cleanup: () => void,
) {
  const reader = body.getReader();
  let bytesRead = 0;
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const chunk = await reader.read();
        if (chunk.done) {
          cleanup();
          controller.close();
          return;
        }
        bytesRead += chunk.value.byteLength;
        if (bytesRead > maxBytes) {
          await reader.cancel();
          cleanup();
          controller.error(new Error("image proxy size limit exceeded"));
          return;
        }
        controller.enqueue(chunk.value);
      } catch (error) {
        cleanup();
        controller.error(error);
      }
    },
    async cancel(reason) {
      try {
        await reader.cancel(reason);
      } finally {
        cleanup();
      }
    },
  });
}

async function cancelBody(body: ReadableStream<Uint8Array> | null) {
  try {
    await body?.cancel();
  } catch {
    // The response is already being discarded; cancellation errors are not actionable.
  }
}

function readAllowedHosts() {
  return (process.env.IMAGE_PROXY_ALLOWED_HOSTS || "").split(",");
}

function normalizeAllowedHosts(hosts: Iterable<string>) {
  const normalized = new Set<string>();
  for (const value of hosts) {
    const hostname = normalizeHostname(value.trim());
    if (
      hostname &&
      !hostname.includes("*") &&
      !hostname.includes("/") &&
      !hostname.includes(":") &&
      !isIP(hostname) &&
      hostname !== "localhost"
    )
      normalized.add(hostname);
  }
  return normalized;
}

function normalizeHostname(hostname: string) {
  return hostname.toLowerCase().replace(/\.+$/, "");
}

async function defaultLookup(hostname: string) {
  return lookup(hostname, { all: true, verbatim: true });
}

function isPublicAddress(address: string, family: number) {
  const detectedFamily = isIP(address);
  if (
    !detectedFamily ||
    ((family === 4 || family === 6) && detectedFamily !== family)
  )
    return false;
  return detectedFamily === 6
    ? !blockedAddresses.ipv6.check(address, "ipv6")
    : !blockedAddresses.ipv4.check(address, "ipv4");
}

function createBlockedAddressList() {
  const ipv4 = new BlockList();
  for (const [address, prefix] of [
    ["0.0.0.0", 8],
    ["10.0.0.0", 8],
    ["100.64.0.0", 10],
    ["127.0.0.0", 8],
    ["169.254.0.0", 16],
    ["172.16.0.0", 12],
    ["192.0.0.0", 24],
    ["192.0.2.0", 24],
    ["192.88.99.0", 24],
    ["192.168.0.0", 16],
    ["198.18.0.0", 15],
    ["198.51.100.0", 24],
    ["203.0.113.0", 24],
    ["224.0.0.0", 4],
    ["240.0.0.0", 4],
  ] as const) {
    ipv4.addSubnet(address, prefix, "ipv4");
  }
  const ipv6 = new BlockList();
  for (const [address, prefix] of [
    ["::", 128],
    ["::1", 128],
    ["::ffff:0:0", 96],
    ["64:ff9b::", 96],
    ["64:ff9b:1::", 48],
    ["100::", 64],
    ["2001::", 23],
    ["2001:db8::", 32],
    ["2002::", 16],
    ["fc00::", 7],
    ["fe80::", 10],
    ["ff00::", 8],
  ] as const) {
    ipv6.addSubnet(address, prefix, "ipv6");
  }
  return { ipv4, ipv6 };
}

function errorResponse(error: unknown) {
  const knownError =
    error instanceof ImageProxyError
      ? error
      : new ImageProxyError(500, "internal_error", "图片代理发生内部错误");
  return Response.json(
    { error: { code: knownError.code, message: knownError.message } },
    {
      status: knownError.status,
      headers: {
        "cache-control": "private, no-store",
        "content-type": "application/json; charset=utf-8",
        "x-content-type-options": "nosniff",
      },
    },
  );
}

function once(callback: () => void) {
  let called = false;
  return () => {
    if (called) return;
    called = true;
    callback();
  };
}
