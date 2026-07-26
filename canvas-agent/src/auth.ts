import crypto from "node:crypto";

export const DEFAULT_PAIRING_TTL_MS = 5 * 60_000;
export const DEFAULT_SESSION_TTL_MS = 60 * 60_000;
export const DEFAULT_RUNTIME_TTL_MS = 12 * 60 * 60_000;

type TokenRecord = { expiresAt: number };
type SessionRecord = TokenRecord & { origin: string };

export type PairingCredential = { code: string; expiresAt: number };
export type SessionCredential = { token: string; origin: string; expiresAt: number };
export type RuntimeCredential = { token: string; expiresAt: number };
export type SessionPrincipal = { kind: "session"; origin: string; expiresAt: number };
export type RuntimePrincipal = { kind: "runtime"; expiresAt: number };
export type AuthManagerOptions = {
    pairingTtlMs?: number;
    sessionTtlMs?: number;
    runtimeTtlMs?: number;
    legacyToken?: string;
    legacyTokenHash?: string;
    now?: () => number;
    randomBytes?: (size: number) => Buffer;
};

export class AuthManager {
    private pairing: (TokenRecord & { hash: string }) | null = null;
    private sessions = new Map<string, SessionRecord>();
    private runtimeTokens = new Map<string, TokenRecord>();
    private legacyTokenHash = "";
    private readonly pairingTtlMs: number;
    private readonly sessionTtlMs: number;
    private readonly runtimeTtlMs: number;
    private readonly now: () => number;
    private readonly randomBytes: (size: number) => Buffer;

    constructor(options: AuthManagerOptions = {}) {
        this.pairingTtlMs = positiveTtl(options.pairingTtlMs, DEFAULT_PAIRING_TTL_MS);
        this.sessionTtlMs = positiveTtl(options.sessionTtlMs, DEFAULT_SESSION_TTL_MS);
        this.runtimeTtlMs = positiveTtl(options.runtimeTtlMs, DEFAULT_RUNTIME_TTL_MS);
        this.now = options.now || Date.now;
        this.randomBytes = options.randomBytes || crypto.randomBytes;
        this.legacyTokenHash = normalizeHash(options.legacyTokenHash) || (options.legacyToken ? hashToken(options.legacyToken) : "");
    }

    createPairingCode(ttlMs = this.pairingTtlMs): PairingCredential {
        const code = pairingCode(this.randomBytes(5));
        const expiresAt = this.now() + positiveTtl(ttlMs, this.pairingTtlMs);
        this.pairing = { hash: hashToken(code), expiresAt };
        return { code, expiresAt };
    }

    exchangePairingCode(code: string, origin: string, ttlMs = this.sessionTtlMs): SessionCredential | null {
        const normalizedOrigin = normalizeOrigin(origin);
        if (!normalizedOrigin) return null;
        const pairing = this.pairing;
        if (!pairing || this.isExpired(pairing) || !safeHashEqual(pairing.hash, hashToken(code))) {
            if (pairing && this.isExpired(pairing)) this.pairing = null;
            return null;
        }
        this.pairing = null;
        return this.issueSessionToken(normalizedOrigin, ttlMs);
    }

    issueSessionToken(origin: string, ttlMs = this.sessionTtlMs): SessionCredential {
        const normalizedOrigin = normalizeOrigin(origin);
        if (!normalizedOrigin) throw new Error("A valid HTTP(S) Origin is required");
        const token = `lcs_${this.randomBytes(32).toString("base64url")}`;
        const expiresAt = this.now() + positiveTtl(ttlMs, this.sessionTtlMs);
        this.sessions.set(hashToken(token), { origin: normalizedOrigin, expiresAt });
        return { token, origin: normalizedOrigin, expiresAt };
    }

    validateSessionToken(token: string, origin: string): SessionPrincipal | null {
        const normalizedOrigin = normalizeOrigin(origin);
        if (!token || !normalizedOrigin) return null;
        const hash = hashToken(token);
        const session = this.sessions.get(hash);
        if (!session || this.isExpired(session)) {
            if (session) this.sessions.delete(hash);
            return null;
        }
        return session.origin === normalizedOrigin ? { kind: "session", origin: session.origin, expiresAt: session.expiresAt } : null;
    }

    validateSessionBearer(header: string | string[] | undefined, origin: string): SessionPrincipal | null {
        const token = parseBearerToken(header);
        return token ? this.validateSessionToken(token, origin) : null;
    }

    revokeSession(token: string) {
        return Boolean(token) && this.sessions.delete(hashToken(token));
    }

    revokeSessionsForOrigin(origin: string) {
        const normalizedOrigin = normalizeOrigin(origin);
        if (!normalizedOrigin) return 0;
        let revoked = 0;
        this.sessions.forEach((session, hash) => {
            if (session.origin !== normalizedOrigin) return;
            this.sessions.delete(hash);
            revoked += 1;
        });
        return revoked;
    }

    issueRuntimeToken(ttlMs = this.runtimeTtlMs): RuntimeCredential {
        const token = `lcr_${this.randomBytes(32).toString("base64url")}`;
        const expiresAt = this.now() + positiveTtl(ttlMs, this.runtimeTtlMs);
        this.runtimeTokens.set(hashToken(token), { expiresAt });
        return { token, expiresAt };
    }

    validateRuntimeToken(token: string): RuntimePrincipal | null {
        if (!token) return null;
        const hash = hashToken(token);
        const runtime = this.runtimeTokens.get(hash);
        if (!runtime || this.isExpired(runtime)) {
            if (runtime) this.runtimeTokens.delete(hash);
            return null;
        }
        return { kind: "runtime", expiresAt: runtime.expiresAt };
    }

    validateRuntimeBearer(header: string | string[] | undefined): RuntimePrincipal | null {
        const token = parseBearerToken(header);
        return token ? this.validateRuntimeToken(token) : null;
    }

    revokeRuntimeToken(token: string) {
        return Boolean(token) && this.runtimeTokens.delete(hashToken(token));
    }

    isLegacyToken(token: string) {
        return Boolean(token && this.legacyTokenHash && safeHashEqual(this.legacyTokenHash, hashToken(token)));
    }

    isLegacyBearer(header: string | string[] | undefined) {
        const token = parseBearerToken(header);
        return Boolean(token && this.isLegacyToken(token));
    }

    private isExpired(record: TokenRecord) {
        return this.now() >= record.expiresAt;
    }
}

export function parseBearerToken(header: string | string[] | undefined) {
    const value = Array.isArray(header) ? header[0] : header;
    const match = value?.match(/^Bearer\s+(\S+)$/i);
    return match?.[1] || "";
}

export function hashToken(token: string) {
    return crypto.createHash("sha256").update(token, "utf8").digest("hex");
}

export function normalizeOrigin(origin: string) {
    if (!origin || origin === "null") return "";
    try {
        const url = new URL(origin);
        return url.protocol === "http:" || url.protocol === "https:" ? url.origin : "";
    } catch {
        return "";
    }
}

function pairingCode(bytes: Buffer) {
    return (
        bytes
            .toString("hex")
            .toUpperCase()
            .match(/.{1,5}/g)
            ?.join("-") || ""
    );
}

function positiveTtl(value: number | undefined, fallback: number) {
    return Number.isFinite(value) && Number(value) > 0 ? Number(value) : fallback;
}

function normalizeHash(value: string | undefined) {
    return typeof value === "string" && /^[a-f0-9]{64}$/i.test(value) ? value.toLowerCase() : "";
}

function safeHashEqual(left: string, right: string) {
    const leftBuffer = Buffer.from(left, "hex");
    const rightBuffer = Buffer.from(right, "hex");
    return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}
