export type ReferenceImage = {
    id: string;
    name: string;
    type: string;
    dataUrl: string;
    url?: string;
    storageKey?: string;
    bytes?: number;
    width?: number;
    height?: number;
};

export type ImageGenerationStatus = "queued" | "generating" | "generated" | "downloading" | "stored" | "remote_only" | "unknown" | "failed";

export type ImageFailureStage = "request_prepare" | "provider_submit" | "provider_processing" | "response_parse" | "result_download" | "indexeddb_write" | "project_persist";

export type ImageErrorKind = "cors" | "dns" | "tls" | "rate_limit" | "auth" | "gateway" | "aborted" | "response_parse" | "url_download" | "indexeddb_write" | "network" | "unknown";

export type ImageProviderMetadata = {
    expiresAt?: number;
    providerTaskId?: string;
    providerRequestId?: string;
};

export type ImageGenerationOutput =
    | ({ id: string; status: "generated"; source: "data_url"; dataUrl: string; mimeType?: string } & ImageProviderMetadata)
    | ({ id: string; status: "remote_only"; source: "remote_url"; remoteUrl: string; mimeType?: string } & ImageProviderMetadata);

export type ImageReferenceOptimization = {
    total: number;
    optimized: number;
};
