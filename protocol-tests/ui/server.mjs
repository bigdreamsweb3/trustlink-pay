import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createHash, createHmac, createPublicKey, randomBytes, randomInt, randomUUID, verify as verifySignature } from "node:crypto";
import { Connection, PublicKey } from "@solana/web3.js";
import { inspectTinFundingOutcome } from "./funding-outcome.mjs";

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
const { fetchNodeResponse } = await import(pathToFileURL(path.join(root, "tsn-protocol/sdks/tsn-sdk/dist/lib/fetch-node-response.js")).href);
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
    : `${(process.env.TSN_RECEIVER_URL ?? "https://tsn-receiver-kappa.vercel.app").replace(/\/$/, "")}/node`;
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

async function resolveTinIdentityFromSdk(tin) {
  const connection = new Connection(await resolveRpcUrl(), "confirmed");
  return tsnSdk.resolveTinV1Identity({
    connection,
    tin,
    lookupSecret: requireTinLookupSecret(),
    programId: tinProgramId,
  });
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
  return Buffer.from(tsnSdk.buildOwnerTinIdentityChallengeMessageV1({
    ownerPublicKey: ownerPubkey.toBase58(), tin, challengeId,
  }));
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (url.pathname === "/") return sendFile(res, "public/index.html", "text/html; charset=utf-8");
  if (url.pathname === "/tsn-dapp.js") return sendFile(res, "public/tsn-dapp.js", "text/javascript; charset=utf-8");
  if (url.pathname === "/tsn-recipient-credit-sdk.bundle.js") return sendFile(res, "public/tsn-recipient-credit-sdk.bundle.js", "text/javascript; charset=utf-8");
  if (url.pathname === "/tsn-tin-creation-sdk.bundle.js") return sendFile(res, "public/tsn-tin-creation-sdk.bundle.js", "text/javascript; charset=utf-8");
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

  async function readNodeBlockhash() {
    const nodeUrl = configuredNodeUrl();
    if (!nodeUrl) return void json(res, 503, { error: "TSN_NODE_URL_NOT_CONFIGURED_FOR_BLOCKHASH" });
    let blockhashResponse;
    try {
      blockhashResponse = await fetchNodeResponse(fetch, `${nodeUrl}/network/recent-blockhash`, {
        cache: "no-store", signal: AbortSignal.timeout(90_000),
      });
    } catch (error) {
      return void json(res, 503, { error: "TSN_NODE_BLOCKHASH_UNAVAILABLE", detail: error instanceof Error ? error.message : String(error) });
    }
    const latestBlockhash = await blockhashResponse.json().catch(() => ({}));
    if (!blockhashResponse.ok) {
      return void json(res, 503, { error: "TSN_NODE_BLOCKHASH_UNAVAILABLE", detail: latestBlockhash.detail ?? latestBlockhash.error ?? "Node returned an invalid blockhash response" });
    }
    try {
      const context = tsnSdk.assertSenderFundingBlockhashContext({
        blockhash: latestBlockhash.recentBlockhash,
        lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
        contextSlot: latestBlockhash.contextSlot,
      });
      return { recentBlockhash: context.blockhash, lastValidBlockHeight: context.lastValidBlockHeight, contextSlot: context.contextSlot };
    } catch {
      return void json(res, 503, { error: "TSN_NODE_BLOCKHASH_UNAVAILABLE", detail: "Node returned an invalid blockhash context" });
    }
  }

  if (req.method === "POST" && url.pathname === "/api/tsn/sdk/refresh-tin-credit-blockhash") {
    const body = await readJson(req), prepared = session.pendingTinCredit;
    if (prepared?.recoveryInFlight) return json(res, 409, { error: "TIN_CREDIT_RECOVERY_IN_PROGRESS" });
    if (!prepared?.readiness || prepared.completion || prepared.senderWallet !== session.wallet
        || prepared.expiresAt <= Date.now() || Date.parse(prepared.readiness.expiresAt) <= Date.now()
        || body.operationId !== prepared.workId || body.expectedStateVersion !== prepared.readiness.stateVersion
        || body.authorizationPayloadCommitment !== prepared.readiness.authorizationPayloadCommitment) {
      return json(res, 409, { error: "TIN_CREDIT_FUNDING_READINESS_REQUIRED" });
    }
    const latestBlockhash = await readNodeBlockhash();
    if (!latestBlockhash) return;
    prepared.senderFundingBlockhashContext = { blockhash: latestBlockhash.recentBlockhash,
      lastValidBlockHeight: latestBlockhash.lastValidBlockHeight, contextSlot: latestBlockhash.contextSlot };
    return json(res, 200, latestBlockhash);
  }

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
    if (session.wallet !== publicKey) {
      session.ownerTinIdentity = null;
      // Retain only public work identity across wallet changes.
      if (session.pendingTinDebit) {
        (session.tinDebitAttempts ??= []).push({ workId: session.pendingTinDebit.paymentId, owner: session.wallet });
        session.pendingTinDebit = null;
      }
    }
    if (session.wallet !== publicKey && !session.pendingTinCredit?.completion) {
      session.pendingTinCredit = null;
      session.pendingTinCreditOperationId = null;
    }
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
    const resourceCommitment = String(body.resourceCommitment ?? "").toLowerCase();
    if (resourceCommitment !== session.pendingTinEncryption.resourceCommitment) {
      return json(res, 422, { error: "OWNER_SEED_RESOURCE_COMMITMENT_MISMATCH" });
    }
    const gpruElgamalKeyVersion = Number(body.gpruElgamalKeyVersion ?? 0);
    const gpruElgamalPublicKey = String(body.gpruElgamalPublicKey ?? "").toLowerCase();
    const gpruElgamalKeyCommitment = String(body.gpruElgamalKeyCommitment ?? "").toLowerCase();
    if (gpruElgamalKeyVersion !== 1 || !/^[0-9a-f]{64}$/.test(gpruElgamalPublicKey) || /^0{64}$/.test(gpruElgamalPublicKey)
      || !/^[0-9a-f]{64}$/.test(gpruElgamalKeyCommitment) || /^0{64}$/.test(gpruElgamalKeyCommitment)) {
      return json(res, 422, { error: "VERSIONED_GPRU_ELGAMAL_KEY_REQUIRED" });
    }
    const gpruElgamalPublicKeyBytes = Buffer.from(gpruElgamalPublicKey, "hex");
    const gpruElgamalKeyCommitmentBytes = Buffer.from(gpruElgamalKeyCommitment, "hex");
    const expectedGpruElgamalKeyCommitment = Buffer.from(tsnSdk.deriveGpruElgamalKeyCommitment(
      gpruElgamalKeyVersion,
      gpruElgamalPublicKeyBytes,
    ));
    if (!expectedGpruElgamalKeyCommitment.equals(gpruElgamalKeyCommitmentBytes)) {
      return json(res, 422, { error: "GPRU_ELGAMAL_KEY_COMMITMENT_MISMATCH" });
    }
    const gpruBalanceScanKeyVersion = Number(body.gpruBalanceScanKeyVersion ?? 0);
    const gpruBalanceScanPublicKeyX = String(body.gpruBalanceScanPublicKeyX ?? "").toLowerCase();
    const gpruBalanceScanPublicKeyY = String(body.gpruBalanceScanPublicKeyY ?? "").toLowerCase();
    if (gpruBalanceScanKeyVersion !== 1
      || !/^[0-9a-f]{64}$/.test(gpruBalanceScanPublicKeyX) || /^0{64}$/.test(gpruBalanceScanPublicKeyX)
      || !/^[0-9a-f]{64}$/.test(gpruBalanceScanPublicKeyY) || /^0{64}$/.test(gpruBalanceScanPublicKeyY)) {
      return json(res, 422, { error: "VERSIONED_GPRU_BALANCE_SCAN_KEY_REQUIRED" });
    }
    if (!tsnSdk.isValidBabyJubPointV1({
      x: BigInt(`0x${gpruBalanceScanPublicKeyX}`),
      y: BigInt(`0x${gpruBalanceScanPublicKeyY}`),
    })) {
      return json(res, 422, { error: "GPRU_BALANCE_SCAN_PUBLIC_KEY_INVALID" });
    }
    const gpruBalanceScanPublicKeyXBytes = Buffer.from(gpruBalanceScanPublicKeyX, "hex");
    const gpruBalanceScanPublicKeyYBytes = Buffer.from(gpruBalanceScanPublicKeyY, "hex");
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
      session.preparedTinDraft = {
        tin, identity, registry, displayName,
        encryptedMasterSeed: encryptedMasterSeed.toString("base64"),
        resourceCommitment, gpruElgamalKeyVersion,
        gpruElgamalPublicKey, gpruElgamalKeyCommitment,
        gpruBalanceScanKeyVersion, gpruBalanceScanPublicKeyX, gpruBalanceScanPublicKeyY,
      };
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
      routeVersion: 1,
      routeNonce: randomBytes(32),
      tipRouteVersion: 1,
      gpruElgamalKeyVersion,
      gpruElgamalPublicKey: gpruElgamalPublicKeyBytes,
      gpruElgamalKeyCommitment: gpruElgamalKeyCommitmentBytes,
      gpruBalanceScanKeyVersion,
      gpruBalanceScanPublicKeyX: gpruBalanceScanPublicKeyXBytes,
      gpruBalanceScanPublicKeyY: gpruBalanceScanPublicKeyYBytes,
      policyCommitment: randomBytes(32),
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
      routeVersion: Number(built.routeVersion),
      routeNonce: hex(built.routeNonce),
      tipRouteVersion: built.tipRouteVersion,
      gpruElgamalKeyVersion: built.gpruElgamalKeyVersion,
      gpruElgamalPublicKey: hex(built.gpruElgamalPublicKey),
      gpruElgamalKeyCommitment: hex(built.gpruElgamalKeyCommitment),
      gpruBalanceScanKeyVersion: built.gpruBalanceScanKeyVersion,
      gpruBalanceScanPublicKeyX: hex(built.gpruBalanceScanPublicKeyX),
      gpruBalanceScanPublicKeyY: hex(built.gpruBalanceScanPublicKeyY),
      policyCommitment: hex(built.policyCommitment),
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
        const identity = await resolveTinIdentityFromSdk(pending.tin);
        if (identity && typeof identity.displayName === "string") displayName = identity.displayName;
      } catch (error) {
        console.warn("[tsn-protocol-ui] finalized TIN name could not be resolved from the TIP registry", error instanceof Error ? error.message : "resolution failed");
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
    let identity;
    try {
      identity = await resolveTinIdentityFromSdk(tin);
    } catch (error) {
      const message = error instanceof Error ? error.message : "TIN resolution failed";
      return json(res, 502, { error: message });
    }
    if (!identity) return json(res, 404, { error: "TIN could not be resolved" });
    const expectedOwnerHash = createHash("sha256").update(ownerPubkey.toBuffer()).digest("hex");
    if (identity.ownerPubkeyHash !== expectedOwnerHash) return json(res, 404, { error: "OWNER_TIN_NOT_FOUND" });
    let balanceContext;
    if (body.includeBalanceContext === true) {
      try {
        balanceContext = await tsnSdk.getTinOwnerBalanceContextV1({
          connection: new Connection(await resolveRpcUrl(), "finalized"),
          registry: identity.registryPda, programId: tinProgramId, ownerPublicKey: ownerPubkey.toBase58(),
        });
      } catch {
        return json(res, 502, { error: "OWNER_TIN_BALANCE_CONTEXT_INVALID" });
      }
    }
    session.ownerTinIdentity = { tin, displayName: identity.displayName };
    return json(res, 200, {
      tin,
      displayName: identity.displayName,
      ...(balanceContext ? { balanceContext } : {}),
      source: "TSN SDK / TIP registry RPC",
    });
  }

  if (req.method === "POST" && url.pathname === "/api/tsn/sdk/resolve-tin") {
    const body = await readJson(req);
    const tin = String(body.tin ?? "").trim();
    if (!/^\d{10}$/.test(tin)) return json(res, 422, { error: "TEN_DIGIT_TIN_REQUIRED" });
    let identity;
    try {
      identity = await resolveTinIdentityFromSdk(tin);
    } catch (error) {
      const message = error instanceof Error ? error.message : "TIN resolution failed";
      return json(res, 502, { error: message });
    }
    if (!identity) return json(res, 404, { error: "TIN could not be resolved" });
    const ownerPubkeyHash = String(identity.ownerPubkeyHash ?? "").toLowerCase();
    if (!/^[a-f0-9]{64}$/.test(ownerPubkeyHash)) return json(res, 502, { error: "SDK_TIN_OWNER_HASH_INVALID" });
    session.resolvedTin = { tin, ownerPubkeyHash, displayName: String(identity.displayName ?? ""), expiresAt: Date.now() + 5 * 60_000 };
    return json(res, 200, {
      tin,
      ownerPubkeyHash,
      displayName: session.resolvedTin.displayName,
      displayNameSource: identity.displayNameSource === "owner-provided" ? "owner-provided" : "not provided",
      verifiedCredentials: Array.isArray(identity.verifiedCredentials) ? identity.verifiedCredentials : [],
      source: "TSN SDK / TIP registry RPC",
    });
  }

  if (req.method === "GET" && url.pathname === "/api/tsn/sdk/tin-debit-status") {
    const workId = String(url.searchParams.get("workId") ?? "");
    if (!workId || !session.wallet || !(session.pendingTinDebit?.paymentId === workId
        || session.tinDebitAttempts?.some(attempt => attempt.workId === workId && attempt.owner === session.wallet))) return json(res, 404, { error: "TIN_DEBIT_NOT_FOUND_IN_SESSION" });
    const receiverUrl = (mode === "local" ? (process.env.TSN_LOCAL_RECEIVER_URL ?? "http://127.0.0.1:8010")
      : process.env.TSN_RECEIVER_URL ?? "https://tsn-receiver-kappa.vercel.app").replace(/\/$/, "");
    const response = await fetch(`${receiverUrl}/api/work-status/${encodeURIComponent(workId)}`, { cache: "no-store", signal: AbortSignal.timeout(10_000) });
    const result = await response.json().catch(() => ({}));
    if (response.ok && result.operationId === workId && result.kind === "TIN_DEBIT"
        && (result.status === "CONFIRMED" || (["REJECTED", "FAILED"].includes(result.status) && result.safeToReplace === true))) {
      if (!session.tinDebitAttempts?.some(attempt => attempt.workId === workId && attempt.owner === session.wallet)) {
        (session.tinDebitAttempts ??= []).push({ workId, owner: session.wallet });
      }
      if (session.pendingTinDebit?.paymentId === workId) session.pendingTinDebit = null;
    }
    return json(res, response.status, result);
  }

  if (req.method === "POST" && ["/api/tsn/sdk/prepare-tin-debit", "/api/tsn/sdk/submit-tin-debit"].includes(url.pathname)) {
    if (!session.wallet || !session.ownerTinIdentity) return json(res, 403, { error: "OWNER_TIN_IDENTITY_REQUIRED" });
    const body = await readJson(req);
    if (body.senderTin !== session.ownerTinIdentity.tin) return json(res, 403, { error: "TIN_DEBIT_SENDER_IDENTITY_MISMATCH" });
    const exactRetry = session.pendingTinDebit && JSON.stringify(session.pendingTinDebit) === JSON.stringify(body);
    const resolved = session.resolvedTin;
    if (!exactRetry && (!resolved || resolved.tin !== body.recipientTin || resolved.expiresAt < Date.now())) return json(res, 409, { error: "TIN_RESOLUTION_REQUIRED" });
    const nodeUrl = configuredNodeUrl();
    if (!nodeUrl) return json(res, 503, { error: "TSN_NODE_URL_NOT_CONFIGURED" });
    const submit = url.pathname.endsWith("submit-tin-debit");
    if (submit) {
      if (!body.approval || body.approval.ownerPublicKey !== Buffer.from(new PublicKey(session.wallet).toBytes()).toString("hex")) return json(res, 403, { error: "TIN_DEBIT_OWNER_APPROVAL_REQUIRED" });
      if (session.pendingTinDebit && JSON.stringify(session.pendingTinDebit) !== JSON.stringify(body)) return json(res, 409, { error: "TIN_DEBIT_ALREADY_PENDING_CHECK_SAME_WORK" });
      session.pendingTinDebit = body;
    }
    const response = await fetchNodeResponse(fetch, `${nodeUrl}/network/tin-debit${submit ? "" : "/prepare"}`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(90_000),
    });
    const result = await response.json().catch(() => ({}));
    if (submit && response.ok) session.pendingTinDebitWorkId = result.workId;
    return json(res, response.status, result);
  }

  if (req.method === "POST" && url.pathname === "/api/tsn/sdk/prepare-tin-credit") {
    const body = await readJson(req);
    const previous = session.pendingTinCredit, senderWallet = session.wallet;
    if (previous?.request && !previous.settlementConfirmed) return json(res, 409, { error: "TIN_CREDIT_AUTHORIZATION_ALREADY_STARTED" });
    if (previous?.recoveryInFlight) return json(res, 409, { error: "TIN_CREDIT_RECOVERY_IN_PROGRESS" });
    const recipientTin = String(body.recipientTin ?? "").trim();
    const resolved = session.resolvedTin;
    if (!resolved || resolved.tin !== recipientTin || resolved.expiresAt < Date.now()) return json(res, 409, { error: "TIN_RESOLUTION_REQUIRED" });
    const mintText = String(body.tokenMintAddress ?? "").trim();
    if (!/^\d{10}$/.test(recipientTin)) return json(res, 422, { error: "TEN_DIGIT_TIN_REQUIRED" });
    if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(mintText)) return json(res, 422, { error: "VALID_TOKEN_MINT_REQUIRED" });
    const amountText = String(body.amount ?? "").trim();
    if (!/^\d+(?:\.\d{1,9})?$/.test(amountText) || Number(amountText) <= 0) return json(res, 422, { error: "POSITIVE_TOKEN_AMOUNT_REQUIRED" });
    // Read only the registered metadata needed for the human-readable message.
    // Node performs reserve, source ownership and available-funds checks after approval.
    const rpc = createRpcReadSession(await resolveRpcUrl());
    const mint = new PublicKey(mintText);
    const mintAccount = await rpc.read(connection => connection.getAccountInfo(mint, "confirmed"));
    const tokenProgram = mintAccount?.owner;
    if (!tokenProgram || !["TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA", "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"].includes(tokenProgram.toBase58())) {
      return json(res, 422, { error: "UNSUPPORTED_TOKEN_MINT_PROGRAM" });
    }
    const tcapProgram = new PublicKey(process.env.TCAP_PROGRAM_ID ?? tsnSdk.GPRU_TCAP_PROGRAM_ID.toBase58());
    const asset = await rpc.read(connection => tsnSdk.resolveTcapGpruDepositAccounts(connection, {
      depositor: new PublicKey(session.wallet), mint, tokenProgram, tcapProgramId: tcapProgram,
    }));
    const [whole, fraction = ""] = amountText.split(".");
    if (fraction.length > asset.decimals) return json(res, 422, { error: "AMOUNT_EXCEEDS_TOKEN_DECIMALS" });
    const amountBaseUnits = BigInt(whole + fraction.padEnd(asset.decimals, "0"));
    if (amountBaseUnits <= 0n || amountBaseUnits > 0xffff_ffff_ffff_ffffn) return json(res, 422, { error: "TOKEN_AMOUNT_OUT_OF_RANGE" });
    if (session.pendingTinCredit !== previous || session.wallet !== senderWallet || session.resolvedTin !== resolved
        || resolved.expiresAt <= Date.now()) return json(res, 409, { error: "TIN_CREDIT_PREPARATION_SESSION_CHANGED" });
    if (previous?.request) {
      (session.tinCreditAttempts ??= []).push({ prepared: previous, outcome: { status: "CREDIT_CONFIRMED" }, clearedAt: Date.now() });
    }
    session.pendingTinCreditOperationId = null;
    session.pendingTinCredit = { recipientTin, recipientHash: resolved.ownerPubkeyHash, mint: mint.toBase58(),
      senderWallet: session.wallet, amountBaseUnits: amountBaseUnits.toString(), decimals: asset.decimals,
      tcapProgramId: tcapProgram.toBase58(), expiresAt: Date.now() + 5 * 60_000 };
    return json(res, 200, { recipientTin, tokenMintAddress: mint.toBase58(), decimals: asset.decimals,
      amountBaseUnits: amountBaseUnits.toString(), tcapProgramId: tcapProgram.toBase58() });
  }

  if (req.method === "POST" && url.pathname === "/api/tsn/sdk/submit-tin-credit") {
    const body = await readJson(req), prepared = session.pendingTinCredit, request = body.request;
    if (prepared?.recoveryInFlight) return json(res, 409, { error: "TIN_CREDIT_RECOVERY_IN_PROGRESS" });
    if (!prepared || prepared.expiresAt < Date.now()) return json(res, 409, { error: "TIN_CREDIT_PREPARATION_EXPIRED" });
    if (!request || request.senderWallet !== session.wallet || request.senderWallet !== prepared.senderWallet
        || request.recipientTin !== prepared.recipientTin || request.recipientHash !== prepared.recipientHash
        || request.tokenMintAddress !== prepared.mint) return json(res, 409, { error: "TIN_CREDIT_REQUEST_DIFFERS_FROM_PREPARATION" });
    if ("senderSignedFundingTransaction" in request || "senderFundingDepositTxB64" in request || "senderFundingBlockhashContext" in request) {
      return json(res, 422, { error: "TSN_INITIAL_INTENT_REQUIRES_MESSAGE_AUTHORIZATION_ONLY" });
    }
    try {
      const note = tsnSdk.assertFundingNoteV1(request.fundingNote), signed = tsnSdk.parsePaymentIntentMessage(request.senderAuthorizationMessage);
      if (request.senderFundingMode !== "tcap_funded_note_v1" || signed.fundingNoteCommitment !== note.commitment
          || signed.amountBaseUnits.toString() !== prepared.amountBaseUnits || signed.tokenMintAddress !== prepared.mint
          || signed.recipientTin !== prepared.recipientTin || signed.expires.getTime() <= Date.now()) {
        return json(res, 409, { error: "TIN_CREDIT_REQUEST_DIFFERS_FROM_PREPARATION" });
      }
      prepared.expiresAt = Math.min(prepared.expiresAt, signed.expires.getTime());
    } catch { return json(res, 422, { error: "INVALID_PRIVATE_FUNDING_AUTHORIZATION" }); }
    const encoded = JSON.stringify(request);
    if (prepared.request && JSON.stringify(prepared.request) !== encoded) return json(res, 409, { error: "TIN_CREDIT_AUTHORIZATION_ALREADY_STARTED" });
    // Retain the exact message/note if the ingress response is lost; retry the same ID.
    prepared.request = request;
    const nodeUrl = configuredNodeUrl();
    if (!nodeUrl) return json(res, 503, { error: "TSN_NODE_URL_NOT_CONFIGURED_FOR_LIVE_MODE" });
    const response = await fetchNodeResponse(fetch, `${nodeUrl}/intents`, { method: "POST", headers: { "content-type": "application/json" },
      body: encoded, signal: AbortSignal.timeout(90_000) });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) return json(res, response.status, result);
    session.pendingTinCreditOperationId = String(result.id ?? result.paymentId ?? request.paymentId);
    prepared.workId = session.pendingTinCreditOperationId;
    return json(res, 200, { ...result, sdk: "@trustlink/tsn-sdk.buildPaymentAuthorizationIntentRequest -> TSN Node /intents" });
  }

  if (req.method === "POST" && url.pathname === "/api/tsn/sdk/prepare-tin-credit-funding") {
    const body = await readJson(req), prepared = session.pendingTinCredit;
    if (prepared?.recoveryInFlight) return json(res, 409, { error: "TIN_CREDIT_RECOVERY_IN_PROGRESS" });
    if (!prepared?.request || prepared.senderWallet !== session.wallet || prepared.expiresAt <= Date.now()
        || body.operationId !== prepared.workId || prepared.completion) return json(res, 409, { error: "TIN_CREDIT_FUNDING_PREPARATION_UNAVAILABLE" });
    const nodeUrl = configuredNodeUrl();
    if (!nodeUrl) return json(res, 503, { error: "TSN_NODE_URL_NOT_CONFIGURED_FOR_LIVE_MODE" });
    const response = await fetchNodeResponse(fetch, `${nodeUrl}/network/funding/readiness`, { method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ workId: prepared.workId, senderPubkey: prepared.senderWallet, authorizationSignature: prepared.request.senderAuthorizationSignature }),
      signal: AbortSignal.timeout(90_000) });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) return json(res, response.status, result);
    try { prepared.readiness = tsnSdk.assertTsnFundingReadiness(result, prepared.request, prepared.workId, new PublicKey(prepared.tcapProgramId)); }
    catch { return json(res, 409, { error: "TIN_CREDIT_READINESS_DIFFERS_FROM_AUTHORIZATION" }); }
    return json(res, 200, prepared.readiness);
  }

  if (req.method === "POST" && url.pathname === "/api/tsn/sdk/complete-tin-credit") {
    const body = await readJson(req), prepared = session.pendingTinCredit, completion = body.completion;
    if (prepared?.recoveryInFlight) return json(res, 409, { error: "TIN_CREDIT_RECOVERY_IN_PROGRESS" });
    if (!prepared?.request || !prepared.readiness || prepared.senderWallet !== session.wallet || !completion) {
      return json(res, 409, { error: "TIN_CREDIT_FUNDING_PREPARATION_UNAVAILABLE" });
    }
    if (prepared.completion && JSON.stringify(prepared.completion) !== JSON.stringify(completion)) {
      return json(res, 409, { error: "TIN_CREDIT_SIGNED_ATTEMPT_ALREADY_SAVED" });
    }
    if (!prepared.completion) {
      const issued = prepared.senderFundingBlockhashContext, supplied = completion.senderFundingBlockhashContext;
      if (!issued || supplied?.blockhash !== issued.blockhash || supplied?.lastValidBlockHeight !== issued.lastValidBlockHeight
          || supplied?.contextSlot !== issued.contextSlot) return json(res, 409, { error: "TIN_CREDIT_BLOCKHASH_CONTEXT_DIFFERS_FROM_ISSUANCE" });
      try {
        const checked = tsnSdk.buildCompleteTsnFundingRequest({ request: prepared.request, readiness: prepared.readiness, workId: prepared.workId,
          senderFundingDepositTxB64: completion.senderFundingDepositTxB64, senderFundingBlockhashContext: supplied,
          tcapProgramId: new PublicKey(prepared.tcapProgramId) });
        if (JSON.stringify(checked) !== JSON.stringify(completion)) return json(res, 409, { error: "TIN_CREDIT_COMPLETION_DIFFERS_FROM_APPROVAL" });
      } catch { return json(res, 422, { error: "SIGNED_FUNDING_TRANSACTION_DIFFERS_FROM_APPROVAL" }); }
      // A lost response never permits a replacement wire or blockhash.
      prepared.completion = completion;
    }
    const nodeUrl = configuredNodeUrl();
    if (!nodeUrl) return json(res, 503, { error: "TSN_NODE_URL_NOT_CONFIGURED_FOR_LIVE_MODE" });
    const response = await fetchNodeResponse(fetch, `${nodeUrl}/network/funding/complete`, { method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify(prepared.completion), signal: AbortSignal.timeout(90_000) });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) return json(res, response.status, result);
    prepared.attached = true;
    return json(res, 200, result);
  }

  if (req.method === "POST" && url.pathname === "/api/tsn/sdk/cancel-tin-credit") {
    await readJson(req);
    if (session.pendingTinCredit?.recoveryInFlight) return json(res, 409, { error: "TIN_CREDIT_RECOVERY_IN_PROGRESS" });
    if (session.pendingTinCredit?.completion) return json(res, 409, { error: "TIN_CREDIT_SIGNED_ATTEMPT_REQUIRES_RECONCILIATION" });
    session.pendingTinCredit = null;
    session.pendingTinCreditOperationId = null;
    return json(res, 200, { status: "LOCAL_FUNDING_APPROVAL_CANCELLED" });
  }

  if (req.method === "POST" && url.pathname === "/api/tsn/sdk/recover-tin-credit") {
    const body = await readJson(req), operationId = String(body.operationId ?? "");
    // Return a lost clearance response without releasing a newer active attempt.
    const archived = session.tinCreditAttempts?.find(attempt => attempt.prepared.workId === operationId
      && attempt.prepared.senderWallet === session.wallet);
    if (archived) return json(res, 200, archived.outcome);
    const prepared = session.pendingTinCredit, senderWallet = session.wallet;
    if (!operationId || !prepared?.request || prepared.workId !== operationId || prepared.senderWallet !== senderWallet
        || session.pendingTinCreditOperationId !== operationId) return json(res, 404, { error: "TIN_CREDIT_OPERATION_NOT_FOUND_IN_SESSION" });
    if (prepared.recoveryInFlight) return json(res, 409, { error: "TIN_CREDIT_RECOVERY_IN_PROGRESS" });
    prepared.recoveryInFlight = true;
    const completion = prepared.completion;
    const current = () => session.pendingTinCredit === prepared && session.wallet === senderWallet
      && session.pendingTinCreditOperationId === operationId && prepared.completion === completion;
    const receiverUrl = (mode === "local" ? process.env.TSN_LOCAL_RECEIVER_URL ?? "http://127.0.0.1:8010"
      : process.env.TSN_RECEIVER_URL ?? "https://tsn-receiver-kappa.vercel.app").replace(/\/$/, "");
    const readStatus = async () => {
      const response = await fetch(`${receiverUrl}/api/work-status/${encodeURIComponent(operationId)}`,
        { cache: "no-store", signal: AbortSignal.timeout(10_000) });
      if (!response.ok) throw new Error("TIN_CREDIT_RECOVERY_STATUS_UNAVAILABLE");
      const work = await response.json();
      if (work.operationId !== operationId || work.kind !== "AUTHORIZED_FUNDING" || !Number.isSafeInteger(work.stateVersion)
          || work.stateVersion < 1) throw new Error("TIN_CREDIT_RECOVERY_STATUS_INVALID");
      return work;
    };
    try {
      const work = await readStatus();
      if (!current()) return json(res, 409, { error: "TIN_CREDIT_RECOVERY_SESSION_CHANGED" });
      let outcome;
      if (work.status === "CONFIRMED" && work.settlement?.status === "CONFIRMED") {
        outcome = { status: "CREDIT_CONFIRMED", reason: "The original funding and credit are confirmed." };
      } else if (!["REJECTED", "FAILED"].includes(work.status)
          || (work.settlement && (!["RECEIVED", "REJECTED"].includes(work.settlement.status) || work.settlement.result?.signature))) {
        return json(res, 200, { status: "OUTCOME_UNKNOWN", reason: "Preserve the original funding and reconcile its existing settlement; a replacement deposit is unavailable." });
      } else if (!completion) {
        if (work.fundingPhase !== "AUTHORIZATION" || work.result?.signature) {
          return json(res, 200, { status: "OUTCOME_UNKNOWN", reason: "The original signed funding is unavailable in this session. Preserve the work for reconciliation." });
        }
        outcome = { status: "UNSIGNED_INTENT_RELEASED", reason: "The rejected authorization has no signed funding transaction." };
      } else {
        if (work.fundingPhase !== "SIGNED_DEPOSIT") return json(res, 200,
          { status: "OUTCOME_UNKNOWN", reason: "Receiver funding phase does not match the saved signed attempt." });
        outcome = await inspectTinFundingOutcome({ completion, rpcUrl: await resolveRpcUrl() });
        if (work.result?.signature && work.result.signature !== outcome.signature) return json(res, 200,
          { status: "OUTCOME_UNKNOWN", reason: "Receiver reports a different funding signature. Preserve both records for reconciliation." });
        if (outcome.status !== "NONEXECUTION_CONFIRMED") return json(res, 200, outcome);
      }
      // Receiver terminal version and the exact owner session must survive every read.
      const checked = await readStatus();
      if (!current() || JSON.stringify(checked) !== JSON.stringify(work)) return json(res, 409, { error: "TIN_CREDIT_RECOVERY_STATE_CHANGED" });
      (session.tinCreditAttempts ??= []).push({ prepared, workStatus: checked, outcome, clearedAt: Date.now() });
      session.pendingTinCredit = null;
      session.pendingTinCreditOperationId = null;
      return json(res, 200, outcome);
    } catch {
      return json(res, 200, { status: "OUTCOME_UNKNOWN", reason: "Funding outcome could not be established. Keep the original attempt and check again." });
    } finally { prepared.recoveryInFlight = false; }
  }

  if (req.method === "GET" && url.pathname === "/api/tsn/sdk/tin-credit-status") {
    const operationId = String(url.searchParams.get("operationId") ?? "");
    const prepared = session.pendingTinCredit?.workId === operationId ? session.pendingTinCredit
      : session.tinCreditAttempts?.find(attempt => attempt.prepared.workId === operationId)?.prepared;
    if (!operationId || !prepared || prepared.senderWallet !== session.wallet) return json(res, 404, { error: "TIN_CREDIT_OPERATION_NOT_FOUND_IN_SESSION" });
    const receiverUrl = (mode === "local"
      ? (process.env.TSN_LOCAL_RECEIVER_URL ?? "http://127.0.0.1:8010")
      : process.env.TSN_RECEIVER_URL ?? "https://tsn-receiver-kappa.vercel.app").replace(/\/$/, "");
    const response = await fetch(`${receiverUrl}/api/work-status/${encodeURIComponent(operationId)}`, { cache: "no-store", signal: AbortSignal.timeout(10_000) });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) return json(res, response.status, result);
    if (session.pendingTinCredit === prepared && result.operationId === operationId && result.kind === "AUTHORIZED_FUNDING"
        && result.status === "CONFIRMED" && result.settlement?.status === "CONFIRMED") prepared.settlementConfirmed = true;
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

server.listen(port, () => console.log(`[tsn-protocol-ui] http://127.0.0.1:${port} Â· SDK-only dApp demonstration`));
