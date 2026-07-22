function cleanBaseUrl(baseUrl: string) {
    return baseUrl.trim().replace(/\/+$/, "");
}

function providerRoot(baseUrl: string) {
    return cleanBaseUrl(baseUrl).replace(/\/(?:compatible-mode\/v1|api\/v1|v1)$/i, "");
}

function join(baseUrl: string, path: string) {
    return `${baseUrl}/${path.replace(/^\/+/, "")}`;
}

export function qwenApiUrl(baseUrl: string, path: string) {
    const normalized = cleanBaseUrl(baseUrl);
    const base = /\/api\/v1$/i.test(normalized) ? normalized : `${providerRoot(normalized)}/api/v1`;
    return join(base, path);
}

export function qwenCompatibleApiUrl(baseUrl: string, path: string) {
    const normalized = cleanBaseUrl(baseUrl);
    const base = /\/compatible-mode\/v1$/i.test(normalized) ? normalized : `${providerRoot(normalized)}/compatible-mode/v1`;
    return join(base, path);
}

export function geminiApiBaseUrl(baseUrl: string) {
    const normalized = cleanBaseUrl(baseUrl);
    return /\/v1(?:beta)?$/i.test(normalized) ? normalized : `${normalized}/v1beta`;
}
