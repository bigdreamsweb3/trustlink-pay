import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createHash, createHmac, createPublicKey, randomBytes, randomInt, randomUUID, verify as verifySignature } from "node:crypto";
import { Connection, PublicKey } from "@solana/web3.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const mode = process.argv.includes("--local") ? "local" : "devnet";
const envFile = path.join(path.dirname(fileURLToPath(import.meta.url)), mode === "local" ? ".env.local" : ".env");
try {
  const envText = await fs.readFile(envFile, "utf8");
  for (const line of envText.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)=(.*)\s*$/);
    if (match && process.env[match[1]] === undefined) process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, "");
  }
} catch { /* environment variables may be supplied by the process manager */ }
const tsnSdk = await import(pathToFileURL(path.join(root, "tsn-protocol/sdks/tsn-sdk/dist/index.js")).href);
const port = Number(process.env.TSN_PROTOCOL_UI_PORT ?? 4317);
// Prefer the local TSN gateway when it is healthy; otherwise use the live TSN
// gateway. Never bypass the TSN gateway with a raw Solana provider.
const configuredRpcUrl = process.env.TSN_RPC_URL ?? process.env.TSN_RPC_GATEWAY_URL ?? null;
const isLoopbackUrl = (value) => {
  try { return ["localhost", "127.0.0.1", "::1"].includes(new URL(value).hostname); } catch { return false; }
};
const localRpcUrl = process.env.TSN_LOCAL_RPC_GATEWAY_URL
  ?? (configuredRpcUrl && isLoopbackUrl(configuredRpcUrl) ? configuredRpcUrl : "http://127.0.0.1:8787");
const liveRpcUrl = process.env.TSN_LIVE_RPC_GATEWAY_URL
  ?? (configuredRpcUrl && !isLoopbackUrl(configuredRpcUrl) ? configuredRpcUrl : "https://tsn-rpc-gateway.vercel.app");
const devnetRpcUrl = "https://api.devnet.solana.com";
function configuredNodeUrl() {
  const value = mode === "local"
    ? process.env.TSN_LOCAL_NODE_URL ?? "http://127.0.0.1:8000"
    : process.env.TSN_NODE_URL ?? "";
  return value.replace(/\/$/, "");
}
let rpcSelectionCache = null;
let rpcSelectionExpiresAt = 0;
async function resolveRpcUrl() {
  if (rpcSelectionCache && Date.now() < rpcSelectionExpiresAt) return rpcSelectionCache;
  try {
    const response = await fetch(localRpcUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getHealth" }),
      signal: AbortSignal.timeout(1500),
    });
    const result = response.ok ? await response.json() : null;
    if (result?.result === "ok") {
      rpcSelectionCache = localRpcUrl;
      rpcSelectionExpiresAt = Date.now() + 5000;
      return rpcSelectionCache;
    }
  } catch { /* the local gateway is optional; use the live TSN gateway */ }
  rpcSelectionCache = liveRpcUrl;
  rpcSelectionExpiresAt = Date.now() + 5000;
  return rpcSelectionCache;
}
function isTransientRpcReadError(error) {
  const message = error instanceof Error ? `${error.message} ${error.cause instanceof Error ? error.cause.message : ""}` : String(error);
  return /fetch failed|operation was aborted|abort(ed)? due to timeout|timed? ?out|ECONN|ENET|UND_ERR|429|502|503|504|failed to get (?:info|token accounts) about account|SolanaJSONRPCError/i.test(message);
}

function rpcLabel(url) {
  return url === localRpcUrl ? "local TSN RPC gateway" : url === liveRpcUrl ? "live TSN RPC gateway" : url === devnetRpcUrl ? "Solana Devnet RPC" : "configured TSN RPC gateway";
}

function createRpcReadSession(initialUrl) {
  let activeUrl = initialUrl;
  let connection = new Connection(activeUrl, "confirmed");
  const triedUrls = new Set([initialUrl]);
  return {
    read: async (operation) => {
      try {
        return await operation(connection);
      } catch (error) {
        if (!isTransientRpcReadError(error)) throw error;
        const failedUrl = activeUrl;
        const fallbackUrl = [localRpcUrl, liveRpcUrl, devnetRpcUrl]
          .find((candidate) => candidate !== failedUrl && !triedUrls.has(candidate));
        if (!fallbackUrl) {
          throw new Error(`${rpcLabel(failedUrl)} failed during a Solana read: ${error instanceof Error ? error.message : String(error)}`, { cause: error });
        }
        triedUrls.add(fallbackUrl);
        activeUrl = fallbackUrl;
        connection = new Connection(activeUrl, "confirmed");
        rpcSelectionCache = activeUrl;
        rpcSelectionExpiresAt = Date.now() + 30_000;
        try {
          return await operation(connection);
        } catch (fallbackError) {
          throw new Error(`${rpcLabel(failedUrl)} and ${rpcLabel(activeUrl)} failed during Solana reads: ${fallbackError instanceof Error ? fallbackError.message : String(fallbackError)}`, { cause: fallbackError });
        }
      }
    },
  };
}
const tinProgramId = process.env.TINS_PROGRAM_ID ?? process.env.TIN_PROGRAM_ID ?? "TinseNnU588NkmRZBe4ADJbxqrqQma92678UFP6VuwT";
const sessions = new Map();
const sessionTtlMs = 30 * 60_000;

function requireTinLookupSecret() {
  const value = String(process.env.TINS_LOOKUP_SECRET ?? "");
  if (Buffer.byteLength(value, "utf8") < 16) throw new Error("TIN V1 issuance is unavailable: configure the shared TINS_LOOKUP_SECRET on the XP server and TSN Node");
  return value;
}

function makeTinIssuanceProof(secret, { ownerPubkey, lookupCommitment, nonce, intentHash, expiryTs }) {
  const expiry = Buffer.alloc(8);
  expiry.writeBigInt64LE(BigInt(expiryTs));
  return createHmac("sha256", secret).update(Buffer.concat([
    Buffer.from("TSN_TIN_V1_ISSUANCE", "utf8"),
    new PublicKey(ownerPubkey).toBuffer(),
    Buffer.from(lookupCommitment),
    Buffer.from(nonce),
    Buffer.from(intentHash),
    expiry,
  ])).digest("hex");
}

function buildOwnerTinIdentityChallengeMessage(ownerPubkey, tin, challengeId) {
  return Buffer.from([
    "TrustLink",
    "Private identity display",
    "",
    "Purpose",
    "",
    "Confirm wallet ownership to display the name encrypted with this TIN.",
    "",
    "Wallet",
    "",
    ownerPubkey.toBase58(),
    "",
    "TIN",
    "",
    tin,
    "",
    "One-time request",
    "",
    challengeId,
    "",
    "This signature authorizes this XP lookup only. It does not authorize a transaction or move funds.",
  ].join("\n"), "utf8");
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (url.pathname === "/") return sendFile(res, "public/index.html", "text/html; charset=utf-8");
  if (url.pathname === "/tsn-dapp.js") return sendFile(res, "public/tsn-dapp.js", "text/javascript; charset=utf-8");
  if (url.pathname === "/tsn-recipient-credit-sdk.bundle.js") return sendFile(res, "public/tsn-recipient-credit-sdk.bundle.js", "text/javascript; charset=utf-8");
  if (url.pathname === "/tsn_icon_logo.png") return sendFile(res, "public/tsn_icon_logo.png", "image/png");
  if (url.pathname === "/api/health") return json(res, 200, { service: "tsn-protocol-ui", status: "READY", sdk: "@trustlink/tsn-sdk", network: "devnet" });
  if (req.method === "POST" && url.pathname === "/api/tsn/rpc") {
    const session = getSession(req);
    if (!session) return json(res, 401, { error: "INVALID_OR_EXPIRED_SESSION" });
    if (req.headers["x-trustlink-csrf"] !== session.csrfToken) return json(res, 403, { error: "CSRF_VALIDATION_FAILED" });
    const payload = await readJson(req);
    if (!payload || typeof payload !== "object" || typeof payload.method !== "string") {
      return json(res, 400, { error: "SOLANA_JSON_RPC_REQUEST_REQUIRED" });
    }
    const rpcResponse = await fetch(await resolveRpcUrl(), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(30_000),
    });
    const responseBody = await rpcResponse.text();
    res.writeHead(rpcResponse.status, {
      "content-type": rpcResponse.headers.get("content-type") ?? "application/json",
      "cache-control": "no-store",
    });
    res.end(responseBody);
    return;
  }
  if (!url.pathname.startsWith("/api/")) return json(res, 404, { error: "NOT_FOUND" });
  try {
    await handleApi(req, res, url);
  } catch (error) {
    console.error(`[tsn-xp] ${req.method} ${url.pathname} failed`, error);
    json(res, 500, { error: "PROTOCOL_UI_ERROR", message: error instanceof Error ? error.message : "Unknown error" });
  }
});

async function handleApi(req, res, url) {
  const origin = req.headers.origin;
  if (origin && !new Set([`http://127.0.0.1:${port}`, `http://localhost:${port}`]).has(origin)) {
    return json(res, 403, { error: "LOCAL_ORIGIN_REQUIRED" });
  }
  if (req.method === "POST" && url.pathname === "/api/session") {
    const id = randomBytes(24).toString("hex");
    const csrfToken = randomBytes(24).toString("hex");
    sessions.set(id, { id, csrfToken, wallet: null, preparedTin: null, touchedAt: Date.now() });
    return json(res, 201, { sessionId: id, csrfToken, network: "devnet", sdk: "@trustlink/tsn-sdk" });
  }
  const session = getSession(req);
  if (!session) return json(res, 401, { error: "INVALID_OR_EXPIRED_SESSION" });
  if (req.method !== "GET" && req.headers["x-trustlink-csrf"] !== session.csrfToken) return json(res, 403, { error: "CSRF_VALIDATION_FAILED" });
  session.touchedAt = Date.now();

  if (url.pathname === "/api/tsn/sdk/network-status") {
    const network = await tsnSdk.getTsnNetworkStatus({
      local: {
        node: process.env.TSN_LOCAL_NODE_URL ?? "http://127.0.0.1:8000",
        receiver: process.env.TSN_LOCAL_RECEIVER_URL ?? "http://127.0.0.1:8010",
        rpc: localRpcUrl,
      },
      live: {
        node: process.env.TSN_NODE_URL ?? null,
        receiver: process.env.TSN_RECEIVER_URL ?? "https://tsn-receiver-kappa.vercel.app",
        rpc: liveRpcUrl,
      },
    });
    return json(res, 200, network);
  }

  if (req.method === "POST" && url.pathname === "/api/session/wallet") {
    const body = await readJson(req);
    const publicKey = String(body.publicKey ?? "").trim();
    if (!publicKey) return json(res, 422, { error: "WALLET_PUBLIC_KEY_REQUIRED" });
    session.wallet = publicKey;
    return json(res, 200, { wallet: publicKey, signer: "connected-browser-wallet" });
  }
  if (req.method === "GET" && url.pathname === "/api/session") return json(res, 200, { wallet: session.wallet, network: "devnet", sdk: "@trustlink/tsn-sdk" });
  if (!session.wallet) return json(res, 409, { error: "BROWSER_WALLET_REQUIRED" });

  if (req.method === "POST" && url.pathname === "/api/tsn/sdk/prepare-tin") {
    const body = await readJson(req);
    const displayName = String(body.displayName ?? "").trim();
    if (!displayName) return json(res, 422, { error: "DISPLAY_NAME_REQUIRED" });
    if (!body.encryptedMasterSeed) {
      const ownerEncryptionNonce = randomBytes(32);
      const seedAccess = await tsnSdk.prepareTinV1OwnerSeedAccess({
        ownerPublicKey: session.wallet,
        displayName,
        nonce: ownerEncryptionNonce,
      });
      session.pendingTinEncryption = { displayName, ownerEncryptionNonce, resourceCommitment: seedAccess.resourceCommitment };
      return json(res, 200, {
        status: "OWNER_ENCRYPTION_SIGNATURE_REQUIRED",
        ownerEncryptionMessage: seedAccess.message,
        resourceCommitment: seedAccess.resourceCommitment,
        ownerEncryptionNonce: ownerEncryptionNonce.toString("hex"),
        sdk: "@trustlink/tsn-sdk.buildTinV1OwnerEncryptionMessage",
      });
    }
    if (!session.pendingTinEncryption || session.pendingTinEncryption.displayName !== displayName) {
      return json(res, 409, { error: "OWNER_ENCRYPTION_MUST_BE_PREPARED_FIRST" });
    }
    const encryptedMasterSeed = Buffer.from(String(body.encryptedMasterSeed ?? session.preparedTinDraft?.encryptedMasterSeed ?? ""), "base64");
    if (encryptedMasterSeed.length === 0) return json(res, 422, { error: "ENCRYPTED_MASTER_SEED_REQUIRED" });
    const gpruCommitment = String(body.gpruCommitment ?? session.preparedTinDraft?.gpruCommitment ?? "").toLowerCase();
    if (!/^[0-9a-f]{64}$/.test(gpruCommitment)) return json(res, 422, { error: "GPRU_COMMITMENT_REQUIRED" });
    const gpruCommitmentBytes = Buffer.from(gpruCommitment, "hex");
    const tipRootCommitment = Buffer.from(tsnSdk.deriveTcapTipRootCommitment(gpruCommitmentBytes));
    const lookupSecret = requireTinLookupSecret();
    const ownerPubkey = new PublicKey(session.wallet);
    const connection = new Connection(await resolveRpcUrl(), "confirmed");
    let tin = session.preparedTinDraft?.tin ?? "";
    let identity = session.preparedTinDraft?.identity;
    let registry = session.preparedTinDraft?.registry;
    if (!tin || !identity || !registry) for (let attempt = 0; attempt < 8; attempt += 1) {
      tin = String(randomInt(1_000_000_000, 10_000_000_000));
      identity = await tsnSdk.createTinV1IdentityEnvelope({ tin, displayName, lookupSecret });
      registry = PublicKey.findProgramAddressSync(
        [Buffer.from("tin-v1", "utf8"), Buffer.from(identity.lookupCommitment)],
        new PublicKey(tinProgramId),
      )[0];
      if (!(await connection.getAccountInfo(registry, "confirmed"))) break;
      tin = "";
    }
    if (!tin || !identity || !registry) throw new Error("Could not reserve a unique private TIN after 8 Devnet checks");
    const encryptedTinRecovery = Buffer.from(String(body.encryptedTinRecovery ?? ""), "base64");
    if (encryptedTinRecovery.length < 28) {
      session.preparedTinDraft = { tin, identity, registry, displayName, encryptedMasterSeed: encryptedMasterSeed.toString("base64"), gpruCommitment };
      const ownerPubkey = new PublicKey(session.wallet);
      const programId = new PublicKey(tinProgramId);
      return json(res, 200, {
        status: "TIN_RECOVERY_SIGNATURE_REQUIRED",
        tin,
        recoveryMessage: Buffer.from(tsnSdk.buildTinV1OwnerRecoveryMessage(ownerPubkey, programId)).toString("utf8"),
        recoveryKeyContextBase64: Buffer.concat([ownerPubkey.toBuffer(), programId.toBuffer()]).toString("base64"),
      });
    }
    const zero = Buffer.alloc(32);
    const built = tsnSdk.buildTinV1Creation({
      ownerPubkey,
      lookupCommitment: identity.lookupCommitment,
      encryptedTinRecovery,
      encryptedIdentityEnvelope: identity.encryptedIdentityEnvelope,
      encryptedMasterSeed,
      encryptedMetadataHash: zero,
      pruConfigurationHash: zero,
      encryptedPublicRouteEnvelope: Buffer.alloc(0),
      routeVersion: 1,
      routeNonce: randomBytes(32),
      tcapRouteVersion: 1,
      tcapRelationshipCommitment: gpruCommitmentBytes,
      tcapRelationshipReference: tipRootCommitment,
      tcapPolicyCommitment: randomBytes(32),
    });
    const intentId = randomUUID();
    const lookupIssuanceProof = makeTinIssuanceProof(lookupSecret, {
      ownerPubkey,
      lookupCommitment: built.lookupCommitment,
      nonce: built.nonce,
      intentHash: built.intentHash,
      expiryTs: built.expiryTs,
    });
    session.preparedTin = { built, displayName, tin, intentId, lookupIssuanceProof };
    session.preparedTinDraft = null;
    session.pendingTinEncryption = null;
    const b64 = (value) => Buffer.from(value).toString("base64");
    const hex = (value) => Buffer.from(value).toString("hex");
    return json(res, 200, {
      intentType: "tin_creation",
      intentId,
      ownerPubkey: session.wallet,
      ownerIntentHash: hex(built.intentHash),
      ownerIntentMessage: Buffer.from(tsnSdk.buildTinOwnerIntentMessage(built.intentHash)).toString("utf8"),
      nonce: hex(built.nonce),
      expiry: Number(built.expiryTs),
      lookupCommitment: hex(built.lookupCommitment),
      encryptedIdentityEnvelope: b64(built.encryptedIdentityEnvelope),
      encryptedMasterSeed: b64(built.encryptedMasterSeed),
      encryptedMetadataHash: hex(built.encryptedMetadataHash),
      // The current TIN V1 route binds no PRU configuration; this value is
      // intentionally the zero hash and is not part of buildTinV1Creation's
      // returned on-chain payload fields.
      pruConfigurationHash: hex(zero),
      encryptedPublicRouteEnvelope: "",
      routeVersion: Number(built.routeVersion),
      routeNonce: hex(built.routeNonce),
      tcapRouteVersion: built.tcapRouteVersion,
      tcapRelationshipCommitment: hex(built.tcapRelationshipCommitment),
      tcapRelationshipReference: hex(built.tcapRelationshipReference),
      gpruCommitment,
      tcapPolicyCommitment: hex(built.tcapPolicyCommitment),
      sdk: "@trustlink/tsn-sdk.buildTinV1Creation",
    });
  }

  if (req.method === "POST" && url.pathname === "/api/tsn/sdk/submit-tin") {
    const body = await readJson(req);
    const signature = String(body.ownerSignature ?? "").trim();
    if (!signature) return json(res, 422, { error: "OWNER_SIGNATURE_REQUIRED" });
    if (!session.preparedTin) return json(res, 409, { error: "TIN_CREATION_MUST_BE_PREPARED_FIRST" });
    const ingressUrl = mode === "local"
      ? (process.env.TSN_LOCAL_RECEIVER_URL ?? "http://127.0.0.1:8010")
      : (process.env.TSN_RECEIVER_URL ?? "https://tsn-receiver-kappa.vercel.app");
    const result = await tsnSdk.submitTinV1Creation({
      ingressUrl,
      prepared: session.preparedTin.built,
      intentId: session.preparedTin.intentId,
      ownerPubkey: session.wallet,
      ownerSignature: signature,
      lookupIssuanceProof: session.preparedTin.lookupIssuanceProof,
      ownerIntentMessage: String(body.ownerIntentMessage ?? ""),
    });
    session.pendingTin = {
      tin: session.preparedTin.tin,
      operationId: result.operationId,
    };
    session.preparedTin = null;
    return json(res, 200, { ...result, sdk: "@trustlink/tsn-sdk.submitTinV1Creation" });
  }

  if (req.method === "GET" && url.pathname === "/api/tsn/sdk/tin-status") {
    const pending = session.pendingTin;
    const operationId = String(url.searchParams.get("operationId") ?? "");
    if (!pending || !operationId || pending.operationId !== operationId) return json(res, 404, { error: "TIN_ISSUANCE_NOT_FOUND_IN_SESSION" });
    const ingressUrl = mode === "local"
      ? (process.env.TSN_LOCAL_RECEIVER_URL ?? "http://127.0.0.1:8010")
      : (process.env.TSN_RECEIVER_URL ?? "https://tsn-receiver-kappa.vercel.app");
    const statusResponse = await fetch(`${ingressUrl.replace(/\/$/, "")}/api/work-status/${encodeURIComponent(operationId)}`, { cache: "no-store" });
    const operation = await statusResponse.json();
    if (!statusResponse.ok) return json(res, statusResponse.status, operation);
    const finalized = operation.status === "CONFIRMED";
    const terminal = finalized || operation.status === "FAILED";
    let displayName;
    if (finalized) {
      try {
        const nodeUrl = (mode === "local"
          ? (process.env.TSN_LOCAL_NODE_URL ?? "http://127.0.0.1:8000")
          : process.env.TSN_NODE_URL ?? "").replace(/\/$/, "");
        const identityResponse = await fetch(`${nodeUrl}/tin-resolution/${encodeURIComponent(pending.tin)}`, { cache: "no-store" });
        const identity = await identityResponse.json().catch(() => ({}));
        if (identityResponse.ok && typeof identity.displayName === "string") displayName = identity.displayName;
      } catch (error) {
        console.warn("[tsn-protocol-ui] finalized TIN name could not be resolved from the registry", error instanceof Error ? error.message : "resolution failed");
      }
    }
    if (terminal) session.pendingTin = null;
    return json(res, 200, {
      operationId,
      status: operation.status,
      signature: operation.result?.signature ?? null,
      ...(finalized ? { tin: pending.tin, ...(displayName ? { displayName } : {}) } : {}),
    });
  }

  if (req.method === "GET" && url.pathname === "/api/tsn/sdk/owner-tin-recovery") {
    const ownerPubkey = new PublicKey(session.wallet);
    const programId = new PublicKey(tinProgramId);
    const connection = new Connection(await resolveRpcUrl(), "confirmed");
    const encryptedTinRecovery = await tsnSdk.getTinV1OwnerRecoveryEnvelope({
      connection,
      ownerPubkey,
      programId,
    });
    if (!encryptedTinRecovery) return json(res, 200, { found: false });
    return json(res, 200, {
      found: true,
      encryptedTinRecovery: Buffer.from(encryptedTinRecovery).toString("base64"),
      recoveryMessage: Buffer.from(tsnSdk.getTinV1OwnerRecoveryMessageForEnvelope(encryptedTinRecovery, ownerPubkey, programId)).toString("utf8"),
      recoveryKeyContextBase64: Buffer.concat([ownerPubkey.toBuffer(), programId.toBuffer()]).toString("base64"),
      sdk: "@trustlink/tsn-sdk.getTinV1OwnerRecoveryEnvelope",
    });
  }

  if (req.method === "POST" && url.pathname === "/api/tsn/sdk/owner-tin-identity-challenge") {
    const body = await readJson(req);
    const tin = String(body.tin ?? "").trim();
    if (!/^\d{10}$/.test(tin)) return json(res, 422, { error: "TEN_DIGIT_TIN_REQUIRED" });
    const ownerPubkey = new PublicKey(session.wallet);
    const challengeId = randomBytes(24).toString("hex");
    session.pendingOwnerTinIdentityChallenge = { tin, challengeId, expiresAt: Date.now() + 120_000 };
    const message = buildOwnerTinIdentityChallengeMessage(ownerPubkey, tin, challengeId);
    return json(res, 200, { challengeId, message: message.toString("utf8") });
  }

  if (req.method === "POST" && url.pathname === "/api/tsn/sdk/owner-tin-identity") {
    const body = await readJson(req);
    const tin = String(body.tin ?? "").trim();
    if (!/^\d{10}$/.test(tin)) return json(res, 422, { error: "TEN_DIGIT_TIN_REQUIRED" });
    const ownerPubkey = new PublicKey(session.wallet);
    const challenge = session.pendingOwnerTinIdentityChallenge;
    session.pendingOwnerTinIdentityChallenge = null;
    if (!challenge || challenge.expiresAt < Date.now() || challenge.tin !== tin || challenge.challengeId !== body.challengeId) {
      return json(res, 401, { error: "OWNER_IDENTITY_CHALLENGE_EXPIRED" });
    }
    const recoveryMessage = buildOwnerTinIdentityChallengeMessage(ownerPubkey, tin, challenge.challengeId);
    const ownerSignature = Buffer.from(String(body.ownerSignature ?? ""), "base64");
    if (ownerSignature.length !== 64) return json(res, 401, { error: "OWNER_IDENTITY_SIGNATURE_REQUIRED" });
    const publicKeyDer = Buffer.concat([
      Buffer.from("302a300506032b6570032100", "hex"),
      ownerPubkey.toBuffer(),
    ]);
    const publicKey = createPublicKey({ key: publicKeyDer, format: "der", type: "spki" });
    if (!verifySignature(null, recoveryMessage, publicKey, ownerSignature)) {
      return json(res, 401, { error: "OWNER_IDENTITY_SIGNATURE_INVALID" });
    }
    const nodeUrl = (mode === "local"
      ? (process.env.TSN_LOCAL_NODE_URL ?? "http://127.0.0.1:8000")
      : process.env.TSN_NODE_URL ?? "").replace(/\/$/, "");
    const identityResponse = await fetch(`${nodeUrl}/tin-resolution/${encodeURIComponent(tin)}`, { cache: "no-store" });
    const identity = await identityResponse.json().catch(() => ({}));
    if (!identityResponse.ok) return json(res, identityResponse.status, identity);
    const expectedOwnerHash = createHash("sha256").update(ownerPubkey.toBuffer()).digest("hex");
    if (identity.ownerPubkeyHash !== expectedOwnerHash) return json(res, 404, { error: "OWNER_TIN_NOT_FOUND" });
    return json(res, 200, {
      tin,
      displayName: identity.displayName,
      source: "TSN Node /tin-resolution",
    });
  }

  if (req.method === "POST" && url.pathname === "/api/tsn/sdk/resolve-tin") {
    const body = await readJson(req);
    const tin = String(body.tin ?? "").trim();
    if (!/^\d{10}$/.test(tin)) return json(res, 422, { error: "TEN_DIGIT_TIN_REQUIRED" });
    const nodeUrl = (mode === "local"
      ? (process.env.TSN_LOCAL_NODE_URL ?? "http://127.0.0.1:8000")
      : process.env.TSN_NODE_URL ?? "").replace(/\/$/, "");
    if (!nodeUrl) return json(res, 503, { error: "TSN_NODE_URL_NOT_CONFIGURED" });
    const response = await fetch(`${nodeUrl}/tin-resolution/${encodeURIComponent(tin)}`, {
      cache: "no-store", signal: AbortSignal.timeout(10_000),
    });
    const identity = await response.json().catch(() => ({}));
    if (!response.ok) return json(res, response.status, identity);
    const ownerPubkeyHash = String(identity.ownerPubkeyHash ?? "").toLowerCase();
    if (!/^[a-f0-9]{64}$/.test(ownerPubkeyHash)) return json(res, 502, { error: "NODE_TIN_OWNER_HASH_INVALID" });
    session.resolvedTin = { tin, ownerPubkeyHash, displayName: String(identity.displayName ?? ""), expiresAt: Date.now() + 5 * 60_000 };
    return json(res, 200, {
      tin,
      ownerPubkeyHash,
      displayName: session.resolvedTin.displayName,
      displayNameSource: identity.displayNameSource === "owner-provided" ? "owner-provided" : "not provided",
      verifiedCredentials: Array.isArray(identity.verifiedCredentials) ? identity.verifiedCredentials : [],
      source: "TSN Node /tin-resolution",
    });
  }

  if (req.method === "POST" && url.pathname === "/api/tsn/sdk/prepare-tin-credit") {
    const body = await readJson(req);
    const recipientTin = String(body.recipientTin ?? "").trim();
    const resolved = session.resolvedTin;
    if (!resolved || resolved.tin !== recipientTin || resolved.expiresAt < Date.now()) {
      return json(res, 409, { error: "TIN_RESOLUTION_REQUIRED" });
    }
    const mintText = String(body.tokenMintAddress ?? "").trim();
    if (!/^\d{10}$/.test(recipientTin)) return json(res, 422, { error: "TEN_DIGIT_TIN_REQUIRED" });
    if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(mintText)) return json(res, 422, { error: "VALID_TOKEN_MINT_REQUIRED" });
    const amountText = String(body.amount ?? "").trim();
    if (!/^\d+(?:\.\d{1,9})?$/.test(amountText) || Number(amountText) <= 0) return json(res, 422, { error: "POSITIVE_TOKEN_AMOUNT_REQUIRED" });
    const rpc = createRpcReadSession(await resolveRpcUrl());
    const mint = new PublicKey(mintText);
    const mintAccount = await rpc.read((connection) => connection.getAccountInfo(mint, "confirmed"));
    const tokenProgram = mintAccount?.owner;
    const supportedTokenPrograms = new Set([
      "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
      "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb",
    ]);
    if (!tokenProgram || !supportedTokenPrograms.has(tokenProgram.toBase58())) return json(res, 422, { error: "UNSUPPORTED_TOKEN_MINT_PROGRAM" });
    const depositor = new PublicKey(session.wallet);
    const tcapProgram = new PublicKey(process.env.TCAP_PROGRAM_ID ?? tsnSdk.GPRU_TCAP_PROGRAM_ID.toBase58());
    const accounts = await rpc.read((connection) => tsnSdk.resolveTcapGpruDepositAccounts(connection, {
      depositor, mint, tokenProgram, tcapProgramId: tcapProgram,
    }));
    const [reserveAccount, vaultAccount] = await rpc.read((connection) => connection.getMultipleAccountsInfo([
      accounts.reserveState, accounts.vault,
    ], "confirmed"));
    const { assetEntryAccount: entryAccount, ...accountAddresses } = accounts;
    const entryData = entryAccount?.data;
    if (!entryAccount || !entryData || !entryAccount.owner.equals(tcapProgram) || entryData.length < 287
      || entryData.subarray(0, 8).toString("hex") !== createHash("sha256").update("account:TcapAssetEntryV1").digest().subarray(0, 8).toString("hex")
      || entryData.subarray(80, 112).toString("hex") !== mint.toBuffer().toString("hex")
      || entryData.subarray(48, 80).toString("hex") !== tokenProgram.toBuffer().toString("hex")) {
      return json(res, 409, { error: "MINT_NOT_REGISTERED_IN_TCAP" });
    }
    if (entryData[245] !== 1 || entryData[247] !== 0 || entryData[283] !== 1 || entryData[284] !== 1 || entryData[285] !== 0) {
      return json(res, 409, { error: "TCAP_ASSET_DEPOSITS_NOT_ENABLED" });
    }
    if (!reserveAccount) return json(res, 409, { error: "TCAP_CANONICAL_RESERVE_ACCOUNT_MISSING", address: accounts.reserveState.toBase58() });
    if (!vaultAccount) return json(res, 409, { error: "TCAP_CANONICAL_VAULT_ACCOUNT_MISSING", address: accounts.vault.toBase58() });
    if (!reserveAccount.owner.equals(tcapProgram)) return json(res, 409, { error: "TCAP_RESERVE_ACCOUNT_OWNER_MISMATCH" });
    if (!vaultAccount.owner.equals(tokenProgram)) return json(res, 409, { error: "TCAP_VAULT_TOKEN_PROGRAM_MISMATCH" });
    if (vaultAccount.data.length < 72 || vaultAccount.data.subarray(0, 32).toString("hex") !== mint.toBuffer().toString("hex")) {
      return json(res, 409, { error: "TCAP_VAULT_TOKEN_ACCOUNT_BINDING_INVALID" });
    }
    const decimals = entryData[244];
    const [whole, fraction = ""] = amountText.split(".");
    if (fraction.length > decimals) return json(res, 422, { error: "AMOUNT_EXCEEDS_TOKEN_DECIMALS" });
    const amountBaseUnits = BigInt(whole + fraction.padEnd(decimals, "0"));
    if (amountBaseUnits <= 0n || amountBaseUnits > 0xffff_ffff_ffff_ffffn) return json(res, 422, { error: "TOKEN_AMOUNT_OUT_OF_RANGE" });
    const senderTokenAccounts = await rpc.read((connection) => connection.getTokenAccountsByOwner(depositor, { mint }, "confirmed"));
    const eligibleSources = senderTokenAccounts.value
      .filter(({ account }) => account.owner.equals(tokenProgram) && account.data.length >= 72
        && account.data.subarray(0, 32).equals(mint.toBuffer())
        && account.data.subarray(32, 64).equals(depositor.toBuffer()))
      .map(({ pubkey, account }) => ({ pubkey, account, balance: account.data.readBigUInt64LE(64) }))
      .sort((left, right) => left.balance === right.balance ? 0 : left.balance > right.balance ? -1 : 1);
    const selectedSource = eligibleSources.find(({ balance }) => balance >= amountBaseUnits);
    if (!selectedSource) {
      return json(res, 409, {
        error: eligibleSources.length ? "INSUFFICIENT_SENDER_TOKEN_BALANCE" : "SENDER_TOKEN_ACCOUNT_MISSING",
        mint: mint.toBase58(),
        associatedTokenAccount: accounts.source.toBase58(),
        availableBaseUnits: eligibleSources.reduce((sum, source) => sum + source.balance, 0n).toString(),
        requiredBaseUnits: amountBaseUnits.toString(),
      });
    }
    accounts.source = selectedSource.pubkey;
    const sourceTokenBalance = selectedSource.balance;
    if (sourceTokenBalance < amountBaseUnits) return json(res, 409, { error: "INSUFFICIENT_SENDER_TOKEN_BALANCE", availableBaseUnits: sourceTokenBalance.toString() });
    const slot = await rpc.read((connection) => connection.getSlot("confirmed"));
    const nodeUrl = configuredNodeUrl();
    if (!nodeUrl) return json(res, 503, { error: "TSN_NODE_URL_NOT_CONFIGURED_FOR_BLOCKHASH" });
    let blockhashResponse;
    try {
      blockhashResponse = await fetch(`${nodeUrl}/network/recent-blockhash`, {
        cache: "no-store", signal: AbortSignal.timeout(10_000),
      });
    } catch (error) {
      return json(res, 503, { error: "TSN_NODE_BLOCKHASH_UNAVAILABLE", detail: error instanceof Error ? error.message : String(error) });
    }
    const latestBlockhash = await blockhashResponse.json().catch(() => ({}));
    if (!blockhashResponse.ok || typeof latestBlockhash.recentBlockhash !== "string"
      || !Number.isInteger(latestBlockhash.lastValidBlockHeight)) {
      return json(res, 503, { error: "TSN_NODE_BLOCKHASH_UNAVAILABLE", detail: latestBlockhash.detail ?? latestBlockhash.error ?? "Node returned an invalid blockhash response" });
    }
    session.pendingTinCredit = {
      recipientTin,
      recipientHash: resolved.ownerPubkeyHash,
      mint: mint.toBase58(),
      amountBaseUnits: amountBaseUnits.toString(),
      expiresAt: Date.now() + 120_000,
      accounts: Object.fromEntries(Object.entries(accountAddresses).map(([key, value]) => [key, value.toBase58()])),
      decimals,
    };
    return json(res, 200, {
      recipientTin,
      decimals,
      amountBaseUnits: amountBaseUnits.toString(),
      currentSlot: slot,
      expiresAtSlot: (latestBlockhash.contextSlot ?? slot) + 300,
      recentBlockhash: latestBlockhash.recentBlockhash,
      lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
      depositAccounts: {
        depositor: depositor.toBase58(), config: accounts.config.toBase58(),
        assetEntry: accounts.assetEntry.toBase58(), reserveState: accounts.reserveState.toBase58(),
        source: accounts.source.toBase58(), vault: accounts.vault.toBase58(), mint: mint.toBase58(),
        tokenProgram: tokenProgram.toBase58(), tcapProgramId: tcapProgram.toBase58(),
      },
      sourceTokenBalance: sourceTokenBalance.toString(),
      sdk: "@trustlink/tsn-sdk.buildTcapGpruWalletDepositTransaction",
    });
  }

  if (req.method === "POST" && url.pathname === "/api/tsn/sdk/submit-tin-credit") {
    const body = await readJson(req);
    const prepared = session.pendingTinCredit;
    const request = body.request;
    if (!prepared || prepared.expiresAt < Date.now()) return json(res, 409, { error: "TIN_CREDIT_PREPARATION_EXPIRED" });
    if (!request || request.senderWallet !== session.wallet || request.recipientTin !== prepared.recipientTin
      || request.recipientHash !== prepared.recipientHash || request.tokenMintAddress !== prepared.mint) {
      return json(res, 409, { error: "TIN_CREDIT_REQUEST_DIFFERS_FROM_PREPARATION" });
    }
    const nodeUrl = configuredNodeUrl();
    if (!nodeUrl) return json(res, 503, { error: "TSN_NODE_URL_NOT_CONFIGURED_FOR_LIVE_MODE" });
    const response = await fetch(`${nodeUrl}/intents`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(request),
      signal: AbortSignal.timeout(30_000),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) return json(res, response.status, result);
    session.pendingTinCredit = null;
    session.pendingTinCreditOperationId = String(result.id ?? result.paymentId ?? "");
    return json(res, 200, { ...result, sdk: "@trustlink/tsn-sdk.buildPaymentAuthorizationIntentRequest -> TSN Node /intents" });
  }

  if (req.method === "GET" && url.pathname === "/api/tsn/sdk/tin-credit-status") {
    const operationId = String(url.searchParams.get("operationId") ?? "");
    if (!operationId || operationId !== session.pendingTinCreditOperationId) return json(res, 404, { error: "TIN_CREDIT_OPERATION_NOT_FOUND_IN_SESSION" });
    const receiverUrl = (mode === "local"
      ? (process.env.TSN_LOCAL_RECEIVER_URL ?? "http://127.0.0.1:8010")
      : process.env.TSN_RECEIVER_URL ?? "https://tsn-receiver-kappa.vercel.app").replace(/\/$/, "");
    const response = await fetch(`${receiverUrl}/api/work-status/${encodeURIComponent(operationId)}`, { cache: "no-store", signal: AbortSignal.timeout(10_000) });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) return json(res, response.status, result);
    return json(res, 200, result);
  }

  if (req.method === "POST" && url.pathname === "/api/tsn/sdk/build-wallet-transfer") {
    const body = await readJson(req);
    const transfer = await tsnSdk.buildTsnSplTokenTransferTransaction({
      senderWallet: session.wallet,
      recipientWallet: String(body.recipientWallet),
      tokenMintAddress: String(body.tokenMintAddress),
      amountUi: String(body.amountUi),
      tokenDecimals: Number(body.tokenDecimals ?? 6),
      rpcUrl: await resolveRpcUrl(),
    });
    return json(res, 200, { status: "UNSIGNED_TRANSACTION_READY", ...transfer, sdk: "@trustlink/tsn-sdk.buildTsnSplTokenTransferTransaction" });
  }

  return json(res, 404, { error: "SDK_ROUTE_NOT_FOUND", method: req.method, path: url.pathname });
}

function getSession(req) {
  const id = String(req.headers["x-trustlink-session"] ?? "");
  const session = sessions.get(id);
  if (!session || Date.now() - session.touchedAt > sessionTtlMs) return null;
  return session;
}

async function readJson(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}

async function sendFile(res, relativePath, contentType) {
  const data = await fs.readFile(path.join(root, "protocol-tests/ui", relativePath));
  res.writeHead(200, { "content-type": contentType, "cache-control": "no-store" });
  res.end(data);
}

function json(res, status, body) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  res.end(JSON.stringify(body));
}

server.listen(port, () => console.log(`[tsn-protocol-ui] http://127.0.0.1:${port} · SDK-only dApp demonstration`));
