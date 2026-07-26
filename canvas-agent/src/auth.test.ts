import assert from "node:assert/strict";
import test from "node:test";

import { AuthManager, hashToken, normalizeOrigin, parseBearerToken } from "./auth.js";

test("pairing code is one-time and creates an origin-bound session", () => {
    let now = 1_000;
    const auth = new AuthManager({ now: () => now, randomBytes: deterministicRandom() });
    const pairing = auth.createPairingCode(100);
    const pairingState = (auth as unknown as { pairing: { hash: string } }).pairing;

    assert.notEqual(pairingState.hash, pairing.code);
    assert.equal(auth.exchangePairingCode("wrong-code", "https://canvas.example"), null);
    assert.equal(auth.exchangePairingCode(pairing.code, "null"), null);

    const session = auth.exchangePairingCode(pairing.code, "https://canvas.example/", 500);
    assert.ok(session);
    assert.equal(session.origin, "https://canvas.example");
    assert.equal(auth.exchangePairingCode(pairing.code, "https://canvas.example"), null);
    assert.deepEqual(auth.validateSessionToken(session.token, "https://canvas.example"), {
        kind: "session",
        origin: "https://canvas.example",
        expiresAt: 1_500,
    });
    assert.equal(auth.validateSessionToken(session.token, "https://other.example"), null);

    const sessions = (auth as unknown as { sessions: Map<string, unknown> }).sessions;
    assert.equal(sessions.has(session.token), false);
    assert.equal(sessions.has(hashToken(session.token)), true);
    now = 1_500;
    assert.equal(auth.validateSessionToken(session.token, session.origin), null);
});

test("expired pairing codes cannot be exchanged", () => {
    let now = 100;
    const auth = new AuthManager({ now: () => now, randomBytes: deterministicRandom() });
    const pairing = auth.createPairingCode(10);

    now = 110;
    assert.equal(auth.exchangePairingCode(pairing.code, "http://localhost:3000"), null);
});

test("Bearer session validation and revocation are scoped by origin", () => {
    const auth = new AuthManager({ randomBytes: deterministicRandom() });
    const first = auth.issueSessionToken("http://localhost:3000");
    const second = auth.issueSessionToken("http://localhost:3000");

    assert.equal(parseBearerToken(`Bearer ${first.token}`), first.token);
    assert.equal(parseBearerToken(`bearer ${first.token}`), first.token);
    assert.equal(parseBearerToken(`Basic ${first.token}`), "");
    assert.ok(auth.validateSessionBearer(`Bearer ${first.token}`, first.origin));
    assert.equal(auth.validateSessionBearer(`Bearer ${first.token}`, "http://localhost:3001"), null);
    assert.equal(auth.revokeSession(first.token), true);
    assert.equal(auth.validateSessionToken(first.token, first.origin), null);
    assert.equal(auth.revokeSessionsForOrigin(second.origin), 1);
    assert.equal(auth.validateSessionToken(second.token, second.origin), null);
});

test("runtime tokens are hashed, short-lived, and revocable", () => {
    let now = 5_000;
    const auth = new AuthManager({ now: () => now, randomBytes: deterministicRandom() });
    const runtime = auth.issueRuntimeToken(100);
    const tokens = (auth as unknown as { runtimeTokens: Map<string, unknown> }).runtimeTokens;

    assert.equal(tokens.has(runtime.token), false);
    assert.equal(tokens.has(hashToken(runtime.token)), true);
    assert.deepEqual(auth.validateRuntimeBearer(`Bearer ${runtime.token}`), { kind: "runtime", expiresAt: 5_100 });
    assert.equal(auth.revokeRuntimeToken(runtime.token), true);
    assert.equal(auth.validateRuntimeToken(runtime.token), null);

    const expiring = auth.issueRuntimeToken(50);
    now = 5_050;
    assert.equal(auth.validateRuntimeToken(expiring.token), null);
});

test("legacy token comparison accepts raw or pre-hashed setup without retaining plaintext", () => {
    const raw = new AuthManager({ legacyToken: "old-connect-token" });
    const hashed = new AuthManager({ legacyTokenHash: hashToken("old-connect-token") });

    assert.equal(raw.isLegacyToken("old-connect-token"), true);
    assert.equal(raw.isLegacyToken("other-token"), false);
    assert.equal(hashed.isLegacyBearer("Bearer old-connect-token"), true);
    assert.equal(JSON.stringify(raw).includes("old-connect-token"), false);
});

test("only HTTP(S) origins are accepted", () => {
    assert.equal(normalizeOrigin("https://canvas.example/path"), "https://canvas.example");
    assert.equal(normalizeOrigin("http://localhost:3000"), "http://localhost:3000");
    assert.equal(normalizeOrigin("file:///tmp/canvas.html"), "");
    assert.equal(normalizeOrigin("null"), "");
});

function deterministicRandom() {
    let value = 0;
    return (size: number) => Buffer.alloc(size, ++value);
}
