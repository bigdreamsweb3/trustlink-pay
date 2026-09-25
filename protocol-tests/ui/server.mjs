import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { randomBytes } from "node:crypto";
import { PublicKey } from "@solana/web3.js";

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
// Use the same live RPC gateway that the SDK network-status check probes.
// A per-run TSN_RPC_URL override remains available for developers.
const rpcUrl = process.env.TSN_RPC_URL
  ?? process.env.TSN_RPC_GATEWAY_URL
  ?? process.env.SOLANA_RPC_URL
  ?? "https://tsn-rpc-gateway.vercel.app";
const tinProgramId = process.env.TIN_PROGRAM_ID ?? "TinseNnU588NkmRZBe4ADJbxqrqQma92678UFP6VuwT";
const sessions = new Map();
const sessionTtlMs = 30 * 60_000;

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (url.pathname === "/") return sendFile(res, "public/index.html", "text/html; charset=utf-8");
  if (url.pathname === "/tsn-dapp.js") return sendFile(res, "public/tsn-dapp.js", "text/javascript; charset=utf-8");
  if (url.pathname === "/tsn_icon_logo.png") return sendFile(res, "public/tsn_icon_logo.png", "image/png");
  if (url.pathname === "/api/health") return json(res, 200, { service: "tsn-protocol-ui", status: "READY", sdk: "@trustlink/tsn-sdk", network: "devnet" });
  if (!url.pathname.startsWith("/api/")) return json(res, 404, { error: "NOT_FOUND" });
  try {
    await handleApi(req, res, url);
  } catch (error) {
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
        rpc: process.env.TSN_LOCAL_RPC_URL ?? "https://tsn-rpc-gateway.vercel.app",
      },
      live: {
        node: process.env.TSN_NODE_URL ?? null,
        receiver: process.env.TSN_RECEIVER_URL ?? "https://tsn-receiver-kappa.vercel.app",
        rpc: process.env.TSN_RPC_GATEWAY_URL ?? "https://tsn-rpc-gateway.vercel.app",
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
      const ownerEncryptionMessage = tsnSdk.buildProgramAssignedTinOwnerEncryptionMessage({
        ownerPublicKey: session.wallet,
        displayName,
        nonce: ownerEncryptionNonce,
      });
      session.pendingTinEncryption = { displayName, ownerEncryptionNonce };
      return json(res, 200, {
        status: "OWNER_ENCRYPTION_SIGNATURE_REQUIRED",
        ownerEncryptionMessage: Buffer.from(ownerEncryptionMessage).toString("utf8"),
        ownerEncryptionNonce: ownerEncryptionNonce.toString("hex"),
        sdk: "@trustlink/tsn-sdk.buildProgramAssignedTinOwnerEncryptionMessage",
      });
    }
    if (!session.pendingTinEncryption || session.pendingTinEncryption.displayName !== displayName) {
      return json(res, 409, { error: "OWNER_ENCRYPTION_MUST_BE_PREPARED_FIRST" });
    }
    const encryptedMasterSeed = Buffer.from(String(body.encryptedMasterSeed ?? ""), "base64");
    if (encryptedMasterSeed.length === 0) return json(res, 422, { error: "ENCRYPTED_MASTER_SEED_REQUIRED" });
    const built = tsnSdk.buildProgramAssignedTinCreation({
      ownerPubkey: new PublicKey(session.wallet),
      displayName,
      encryptedMasterSeed,
    });
    session.preparedTin = { built, displayName };
    session.pendingTinEncryption = null;
    const b64 = (value) => Buffer.from(value).toString("base64");
    const hex = (value) => Buffer.from(value).toString("hex");
    return json(res, 200, {
      intentType: "tin_creation",
      programAssigned: true,
      ownerPubkey: session.wallet,
      displayName,
      ownerIntentHash: hex(built.intentHash),
      ownerIntentMessage: Buffer.from(tsnSdk.buildTinOwnerIntentMessage(built.intentHash)).toString("utf8"),
      nonce: hex(built.nonce),
      expiry: Number(built.expiryTs),
      encryptedMasterSeed: b64(built.encryptedMasterSeed),
      encryptedMetadataHash: hex(built.encryptedMetadataHash),
      pruConfigurationHash: hex(built.pruConfigurationHash),
      encryptedPublicRouteEnvelope: "",
      routeVersion: Number(built.routeVersion),
      routeNonce: hex(built.routeNonce),
      tcapRouteVersion: built.tcapRouteVersion,
      tcapRelationshipCommitment: hex(built.tcapRelationshipCommitment),
      tcapRelationshipReference: hex(built.tcapRelationshipReference),
      tcapPolicyCommitment: hex(built.tcapPolicyCommitment),
      sdk: "@trustlink/tsn-sdk.buildProgramAssignedTinCreation",
    });
  }

  if (req.method === "POST" && url.pathname === "/api/tsn/sdk/submit-tin") {
    const body = await readJson(req);
    const signature = String(body.ownerSignature ?? "").trim();
    if (!signature) return json(res, 422, { error: "OWNER_SIGNATURE_REQUIRED" });
    if (!session.preparedTin) return json(res, 409, { error: "TIN_CREATION_MUST_BE_PREPARED_FIRST" });
    const nodeUrl = process.env.TSN_LOCAL_NODE_URL ?? process.env.TSN_NODE_URL ?? "http://127.0.0.1:8000";
    const ingressUrl = mode === "local"
      ? (process.env.TSN_LOCAL_RECEIVER_URL ?? "http://127.0.0.1:8010")
      : (process.env.TSN_RECEIVER_URL ?? "https://tsn-receiver-kappa.vercel.app");
    const result = await tsnSdk.submitProgramAssignedTinCreation({
      nodeUrl,
      ingressUrl,
      prepared: session.preparedTin.built,
      ownerPubkey: session.wallet,
      ownerSignature: signature,
      displayName: session.preparedTin.displayName,
      ownerIntentMessage: String(body.ownerIntentMessage ?? ""),
    });
    session.preparedTin = null;
    return json(res, 200, { ...result, sdk: "@trustlink/tsn-sdk.submitProgramAssignedTinCreation" });
  }

  if (req.method === "POST" && url.pathname === "/api/tsn/sdk/resolve-tin") {
    const body = await readJson(req);
    const tin = String(body.tin ?? "").trim();
    if (!/^\d{10}$/.test(tin)) return json(res, 422, { error: "TEN_DIGIT_TIN_REQUIRED" });
    const identity = await tsnSdk.resolveTinRoute({ tin, rpcUrl, programId: tinProgramId });
    if (!identity.tcapRelationshipCommitment || identity.tcapRouteVersion == null) {
      return json(res, 409, { error: "CURRENT_TIN_ROUTE_NOT_AVAILABLE", tin, upgradeRequired: identity.upgradeRequired });
    }
    return json(res, 200, {
      tin,
      recipientRouteCommitment: identity.tcapRelationshipCommitment,
      recipientRouteVersion: identity.tcapRouteVersion,
      source: "@trustlink/tsn-sdk.resolveTinRoute",
    });
  }

  if (req.method === "POST" && url.pathname === "/api/tsn/sdk/prepare-payment") {
    const body = await readJson(req);
    const amount = Number(body.amount);
    if (!Number.isFinite(amount) || amount <= 0) return json(res, 422, { error: "POSITIVE_AMOUNT_REQUIRED" });
    const authorization = tsnSdk.createPaymentAuthorization({
      senderWallet: session.wallet,
      senderIdentity: `wallet:${session.wallet}`,
      receiverIdentity: `tin:${String(body.recipientTin)}`,
      recipientRouteCommitment: String(body.recipientRouteCommitment),
      recipientRouteVersion: Number(body.recipientRouteVersion),
      tokenMintAddress: String(body.tokenMintAddress),
      amount,
      senderFeeAmount: Number(body.senderFeeAmount ?? 0),
      totalTokenRequiredUi: amount + Number(body.senderFeeAmount ?? 0),
      fundingMode: "wallet_only_v2",
    });
    return json(res, 200, {
      status: "WALLET_SIGNATURE_REQUIRED",
      paymentId: randomBytes(16).toString("hex"),
      ...authorization,
      senderWallet: session.wallet,
      recipientTin: String(body.recipientTin),
      recipientRouteCommitment: String(body.recipientRouteCommitment),
      recipientRouteVersion: Number(body.recipientRouteVersion),
      tokenMintAddress: String(body.tokenMintAddress),
      amount,
      sdk: "@trustlink/tsn-sdk.createPaymentAuthorization",
    });
  }

  if (req.method === "POST" && url.pathname === "/api/tsn/sdk/submit-payment") {
    const body = await readJson(req);
    const receiverUrl = process.env.TSN_RECEIVER_URL?.trim();
    const apiKey = process.env.TSN_RECEIVER_NODE_API_KEY?.trim();
    if (!receiverUrl || !apiKey) return json(res, 503, { error: "RECEIVER_CONFIGURATION_REQUIRED" });
    const result = await tsnSdk.submitPaymentAuthorizationToMempool({
      mempoolUrl: receiverUrl,
      apiKey,
      paymentId: String(body.paymentId),
      recipientHash: String(body.recipientTin),
      recipientTin: String(body.recipientTin),
      recipientRouteCommitment: String(body.recipientRouteCommitment),
      recipientRouteVersion: Number(body.recipientRouteVersion),
      tokenMintAddress: String(body.tokenMintAddress),
      senderWallet: session.wallet,
      senderAuthorizationMessage: String(body.message),
      senderAuthorizationSignature: String(body.signatureBase64),
      senderAuthorizationNonce: String(body.nonce),
      senderAuthorizationIssuedAt: String(body.issuedAt),
      senderAuthorizationExpiresAt: String(body.expiresAt),
      amount: Number(body.amount),
      senderFundingMode: "wallet_only_v2",
      source: "tsn-protocol-ui",
    });
    return json(res, 201, { status: "INTENT_SUBMITTED", ...result, sdk: "@trustlink/tsn-sdk.submitPaymentAuthorizationToMempool" });
  }

  if (req.method === "POST" && url.pathname === "/api/tsn/sdk/build-wallet-transfer") {
    const body = await readJson(req);
    const transfer = await tsnSdk.buildTsnSplTokenTransferTransaction({
      senderWallet: session.wallet,
      recipientWallet: String(body.recipientWallet),
      tokenMintAddress: String(body.tokenMintAddress),
      amountUi: String(body.amountUi),
      tokenDecimals: Number(body.tokenDecimals ?? 6),
      rpcUrl,
    });
    return json(res, 200, { status: "UNSIGNED_TRANSACTION_READY", ...transfer, sdk: "@trustlink/tsn-sdk.buildTsnSplTokenTransferTransaction" });
  }

  if (req.method === "POST" && url.pathname === "/api/tsn/sdk/build-funding") {
    const body = await readJson(req);
    const funding = await tsnSdk.buildTsnSponsoredSettlementTransaction({
      crankerFeePayer: session.wallet,
      senderWallet: session.wallet,
      tokenMintAddress: String(body.tokenMintAddress),
      amountUi: String(body.amountUi),
      tokenDecimals: Number(body.tokenDecimals ?? 6),
      rpcUrl,
    });
    return json(res, 200, { status: "UNSIGNED_FUNDING_READY", ...funding, sdk: "@trustlink/tsn-sdk.buildTsnSponsoredSettlementTransaction" });
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
