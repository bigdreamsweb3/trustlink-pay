import dotenv from "dotenv";
import { createHash, createPublicKey, verify as verifySignature } from "node:crypto";
import nacl from "tweetnacl";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  Connection,
  Ed25519Program,
  Keypair,
  PublicKey,
  SYSVAR_INSTRUCTIONS_PUBKEY,
  SystemProgram,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";
import { CreditcoinCranker } from "../../tsn-crosschain/src/creditcoin-cranker.js";
import {
  tsnFetchMotherEscrowOnChain,
  getTsnCrankerPda,
} from "../../../sdks/tsn-sdk/src/blockchain/solana-tsn.js";
import {
  buildTsnRegisterTcapCreditAuthorizationV2Instruction,
  GPRU_TCAP_PROGRAM_ID as TCAP_PROGRAM_ID,
} from "../../../sdks/tsn-sdk/src/tcap-gpru-credit.js";
import { resolveSolanaRpcUrls } from "../../../sdks/tsn-sdk/src/rpc.js";
import {
  getTinsGlobalStatePda,
  getTinV1CreationStagingPda,
  getTinV1OwnerRecoveryPda,
  serializeTinV1CreationStageParams,
  serializeTinV1CreationChunkParams,
  serializeTinV1CreationFinalizeParams,
  serializeTinV1CreationParams,
} from "../../../sdks/tsn-sdk/src/tins.js";

// Read local overrides first, then shared defaults. Inherited process
// variables keep precedence; RPC errors never select another endpoint.
dotenv.config({ path: resolve(process.cwd(), ".env.local") });
dotenv.config({ path: resolve(process.cwd(), ".env") });

type Work = {
  id: string;
  kind: "AUTHORIZED_FUNDING" | "SETTLEMENT" | "TIN_OPERATION";
  stateVersion: number;
  status: string;
  payloadCommitment: string;
  verification?: {
    verificationType?: string | null;
    verifiedPayload?: Record<string, unknown>;
    nodeAttestation?: Record<string, unknown> | null;
  } | null;
  authorization?: Record<string, unknown> | null;
  crankerLease?: { leaseId?: string; expiresAt?: string; version?: number } | null;
};

const NODE_ATTESTATION_FIELDS = [
  "version", "workId", "workKind", "decision", "inputPayloadCommitment",
  "evidenceCommitment", "executionPayloadCommitment", "verificationType", "leaseId", "leaseVersion",
  "nodeId", "keyId", "signedAt",
] as const;

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
      .map(([key, child]) => `${JSON.stringify(key)}:${stableJson(child)}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

function verifyNodeAttestation(work: Work) {
  const attestation = work.verification?.nodeAttestation;
  const encodedPublicKey = process.env.TSN_NODE_VERIFICATION_PUBLIC_KEY?.trim();
  if (!attestation || !encodedPublicKey) {
    throw new Error("Node verification receipt or pinned public key is missing");
  }
  let publicKeyBytes: Buffer;
  if (/^[0-9a-fA-F]{64}$/.test(encodedPublicKey)) publicKeyBytes = Buffer.from(encodedPublicKey, "hex");
  else {
    publicKeyBytes = Buffer.from(encodedPublicKey, "base64");
    if (publicKeyBytes.length !== 32 || publicKeyBytes.toString("base64").replace(/=+$/, "") !== encodedPublicKey.replace(/=+$/, "")) {
      throw new Error("Pinned Node verification public key is invalid");
    }
  }
  const keyId = createHash("sha256").update(publicKeyBytes).digest("hex").slice(0, 24);
  const expected = {
    version: 1,
    algorithm: "Ed25519",
    workId: work.id,
    workKind: work.kind,
    decision: "VERIFIED",
    inputPayloadCommitment: work.payloadCommitment,
    verificationType: work.verification?.verificationType ?? "",
    keyId,
  };
  for (const [field, value] of Object.entries(expected)) {
    if (attestation[field] !== value) throw new Error(`Node verification receipt context mismatch: ${field}`);
  }
  const verifiedPayload = work.verification?.verifiedPayload ?? {};
  const attestedFields: Record<Work["kind"], readonly string[]> = {
    AUTHORIZED_FUNDING: [
      "senderSignedFundingTransaction", "senderFundingMode", "tcapCreditTransition", "recipientTin",
      "tokenMintAddress", "amount", "senderWallet",
      "senderAuthorizationMessage", "senderAuthorizationSignature", "senderAuthorizationNonce",
    ],
    SETTLEMENT: ["tcapCreditTransition"],
    TIN_OPERATION: [
      "intentId", "intentType", "ownerPubkey", "ownerSignature", "ownerIntentHash",
      "ownerIntentMessage", "ownerSignatureMessageFormat", "expiry", "nonce", "displayName", "lookupCommitment",
      "encryptedIdentityEnvelope", "encryptedTinRecovery", "encryptedMasterSeed", "encryptedMetadataHash",
      "routeVersion", "routeNonce", "tcapRouteVersion",
      "tcapRelationshipCommitment", "tcapRelationshipReference", "tcapPolicyCommitment",
    ],
  };
  const executionPayload = Object.fromEntries(
    attestedFields[work.kind].filter((field) => field in verifiedPayload).map((field) => [field, verifiedPayload[field]]),
  );
  const executionPayloadCommitment = createHash("sha256").update(stableJson(executionPayload)).digest("hex");
  if (attestation.executionPayloadCommitment !== executionPayloadCommitment) {
    throw new Error("Node verification receipt does not match the Cranker execution payload");
  }
  const values = NODE_ATTESTATION_FIELDS.map((field) => String(attestation[field] ?? ""));
  if (values.some((value) => value.includes("\n") || value.includes("\r"))) throw new Error("Node verification receipt has an invalid field");
  const message = Buffer.from(`TSN_NODE_VERIFICATION_V1\n${values.join("\n")}`, "utf8");
  const signature = Buffer.from(String(attestation.signatureBase64 ?? ""), "base64");
  const publicKey = createPublicKey({
    key: Buffer.concat([Buffer.from("302a300506032b6570032100", "hex"), publicKeyBytes]),
    format: "der",
    type: "spki",
  });
  if (
    signature.length !== 64
    || signature.toString("base64").replace(/=+$/, "") !== String(attestation.signatureBase64).replace(/=+$/, "")
    || !verifySignature(null, message, publicKey, signature)
  ) {
    throw new Error("Node verification receipt signature is invalid");
  }
}

function crankerLog(message: string) {
  console.log(`[${new Date().toISOString()}] [tsn-cranker] ${message}`);
}

function bs58Encode(bytes: Uint8Array): string {
  const alphabet = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  let value = BigInt(`0x${Buffer.from(bytes).toString("hex")}`);
  let encoded = "";
  while (value > 0n) {
    const remainder = Number(value % 58n);
    encoded = alphabet[remainder] + encoded;
    value /= 58n;
  }
  for (const byte of bytes) {
    if (byte !== 0) break;
    encoded = `1${encoded}`;
  }
  return encoded || "1";
}

async function confirmSignatureViaRpc(connection: Connection, signature: string, label: string, timeoutMs = 90_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const response = await connection.getSignatureStatuses([signature], { searchTransactionHistory: true });
    const status = response.value[0];
    if (status?.err) throw new Error(`${label} transaction failed on chain: ${JSON.stringify(status.err)}`);
    if (status && ["confirmed", "finalized"].includes(String(status.confirmationStatus))) {
      return status;
    }
    await new Promise((resolve) => setTimeout(resolve, 2_000));
  }
  throw new Error(`${label} was not confirmed within ${timeoutMs}ms; signature=${signature}`);
}

const creditcoinCranker = () => {
  const keypairFile = process.env.CREDITCOIN_CRANKER_KEYPAIR_FILE?.trim();
  const privateKey = keypairFile
    ? (
        JSON.parse(readFileSync(resolve(keypairFile), "utf8")) as {
          privateKey?: string;
        }
      ).privateKey?.trim()
    : undefined;
  const rpcUrl = process.env.CREDITCOIN_RPC_URL?.trim();
  const hub = process.env.CREDITCOIN_SETTLEMENT_HUB?.trim();
  const registry = process.env.CREDITCOIN_LIQUIDITY_REGISTRY?.trim();
  const routeId = process.env.CREDITCOIN_ROUTE_ID?.trim();
  if (!privateKey || !rpcUrl || !hub || !registry || !routeId) {
    throw new Error(
      "Creditcoin Cranker requires CREDITCOIN_RPC_URL, CREDITCOIN_CRANKER_KEYPAIR_FILE, CREDITCOIN_SETTLEMENT_HUB, CREDITCOIN_LIQUIDITY_REGISTRY, and CREDITCOIN_ROUTE_ID",
    );
  }
  return new CreditcoinCranker({
    rpcUrl,
    hub: hub as `0x${string}`,
    signerPrivateKey: privateKey,
    route: {
      rpcUrl,
      registry: registry as `0x${string}`,
      routeId: routeId as `0x${string}`,
    },
  });
};

let activeReceiverUrl: string | null = null;
const receiver = () => activeReceiverUrl ?? (
  process.env.TSN_RECEIVER_URL || "https://tsn-receiver-kappa.vercel.app"
).replace(/\/$/, "");

async function selectReceiver() {
  const localUrl = (process.env.TSN_LOCAL_RECEIVER_URL || "http://127.0.0.1:8010")
    .trim().replace(/\/$/, "");
  const fallbackUrl = (process.env.TSN_RECEIVER_URL || "https://tsn-receiver-kappa.vercel.app")
    .trim().replace(/\/$/, "");
  try {
    const response = await fetch(`${localUrl}/api/health`, {
      signal: AbortSignal.timeout(1_500),
      headers: { accept: "application/json" },
    });
    const health = response.ok ? await response.json() as Record<string, unknown> : null;
    if (health?.service === "TSN_RECEIVER" && health.status === "READY") {
      activeReceiverUrl = localUrl;
      console.log(`[tsn-cranker] Receiver selected=local url=${displayRpcEndpoint(localUrl)} storage=${String(health.storage ?? "unknown")}`);
      return activeReceiverUrl;
    }
    console.log(`[tsn-cranker] Local Receiver is not ready (${String(health?.status ?? response.status)}); using configured hosted Receiver`);
  } catch (error) {
    const reason = error instanceof Error ? error.name : "unavailable";
    console.log(`[tsn-cranker] Local Receiver is unavailable (${reason}); using configured hosted Receiver`);
  }
  activeReceiverUrl = fallbackUrl;
  console.log(`[tsn-cranker] Receiver selected=hosted url=${displayRpcEndpoint(fallbackUrl)}`);
  return activeReceiverUrl;
}
const displayRpcEndpoint = (value: string) => {
  try {
    const url = new URL(value);
    return `${url.protocol}//${url.host}`;
  } catch {
    return "configured RPC endpoint";
  }
};

function createSolanaConnection(rpcUrl: string) {
  const configuredWsUrl = process.env.TSN_RPC_WS_URL?.trim();
  let wsEndpoint = configuredWsUrl;
  if (!wsEndpoint) {
    const endpoint = new URL(rpcUrl);
    endpoint.protocol = endpoint.protocol === "https:" ? "wss:" : "ws:";
    // The TSN gateway serves PubSub on its HTTP port at /ws. Without an
    // explicit endpoint web3.js assumes Solana's adjacent WS port (+1).
    if (endpoint.pathname === "/" || endpoint.pathname === "") {
      endpoint.pathname = process.env.TSN_RPC_GATEWAY_WS_PATH?.trim() || "/ws";
    }
    wsEndpoint = endpoint.toString();
  }
  return new Connection(rpcUrl, {
    commitment: "confirmed",
    wsEndpoint,
  });
}

async function resolveWorkingSolanaRpcUrl() {
  const candidates = resolveSolanaRpcUrls({ frontendSafe: false });
  const failures: string[] = [];
  for (const rpcUrl of candidates) {
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      let check = "getVersion";
      try {
        const connection = createSolanaConnection(rpcUrl);
        await connection.getVersion();
        check = "Mother Escrow account read";
        const mother = await tsnFetchMotherEscrowOnChain(rpcUrl);
        if (!mother?.valid) {
          const detail = mother && "reason" in mother ? ` (${mother.reason})` : "";
          throw new Error(`Mother Escrow is missing or invalid${detail}`);
        }
        console.log(`[tsn-cranker] Solana RPC ready=${displayRpcEndpoint(rpcUrl)}`);
        return { rpcUrl, mother };
      } catch (error) {
        const parts: string[] = [];
        let current: unknown = error;
        for (let depth = 0; current && depth < 3; depth += 1) {
          if (current instanceof Error) {
            const code = "code" in current && typeof current.code === "string" ? ` ${current.code}` : "";
            parts.push(`${current.name}${code}: ${current.message}`);
            current = current.cause;
          } else {
            parts.push(String(current));
            break;
          }
        }
        const safeReason = (parts.join(" <- ") || "request failed")
          .replace(/https?:\/\/[^\s]+/gi, "[RPC URL]")
          .replace(/([?&](?:api[-_]?key|key|token|secret)=)[^&\s]+/gi, "$1[REDACTED]")
          .replace(/\s+/g, " ")
          .slice(0, 240);
        if (attempt < 3 && /fetch failed|timeout|timed out|UND_ERR_CONNECT|ECONNRESET|EAI_AGAIN/i.test(safeReason)) {
          console.warn(`[tsn-cranker] RPC ${check} attempt ${attempt}/3 failed at ${displayRpcEndpoint(rpcUrl)}; retrying same gateway`);
          await new Promise((resolve) => setTimeout(resolve, attempt * 1_000));
          continue;
        }
        failures.push(`${displayRpcEndpoint(rpcUrl)} ${check}: ${safeReason}`);
        break;
      }
    }
  }
  throw new Error(`The configured TSN RPC gateway failed startup validation after same-endpoint retries; no alternate RPC was attempted. ${failures.join("; ")}`);
}
const operator = () => {
  const path = resolve(
    process.env.TSN_CRANKER_KEYPAIR_PATH ||
      process.env.KEYPAIR_PATH ||
      "./keys/cranker-keypair.json",
  );
  return Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(readFileSync(path, "utf8")) as number[]),
  );
};
const motherAuthority = () => {
  const path = process.env.TSN_MOTHER_AUTHORITY_KEYPAIR_PATH?.trim();
  if (!path) throw new Error("TSN_MOTHER_AUTHORITY_KEYPAIR_PATH is required for TCAP one-time credit submission");
  const secret = JSON.parse(readFileSync(resolve(path), "utf8")) as number[];
  return Keypair.fromSecretKey(Uint8Array.from(secret));
};
const hash = (value: string) =>
  createHash("sha256").update(value, "utf8").digest();
const hex32 = (value: unknown, field: string) => {
  const bytes = Buffer.from(String(value ?? ""), "hex");
  if (bytes.length !== 32) throw new Error(`${field} must be 32 bytes`);
  return Uint8Array.from(bytes);
};

function buildInitializeTcapTinTipInstruction(fields: {
  payer: PublicKey;
  motherEscrow: PublicKey;
  cranker: PublicKey;
  tip: PublicKey;
  tipRootCommitment: string;
  initialCommitment: string;
  policyCommitment: string;
}) {
  const root = Buffer.from(hex32(fields.tipRootCommitment, "tipRootCommitment"));
  const [expectedTip] = PublicKey.findProgramAddressSync(
    [Buffer.from("tcap:tin-tip:v1"), root],
    TCAP_PROGRAM_ID,
  );
  if (!expectedTip.equals(fields.tip)) throw new Error("TCAP_TIN_TIP_PDA_MISMATCH");
  return new TransactionInstruction({
    programId: TCAP_PROGRAM_ID,
    keys: [
      { pubkey: fields.payer, isSigner: true, isWritable: true },
      { pubkey: fields.motherEscrow, isSigner: false, isWritable: false },
      { pubkey: fields.cranker, isSigner: false, isWritable: false },
      { pubkey: fields.tip, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: Buffer.concat([
      hash("global:initialize_tcap_tin_tip_v1").subarray(0, 8),
      root,
      Buffer.from(hex32(fields.initialCommitment, "initialCommitment")),
      Buffer.from(hex32(fields.policyCommitment, "policyCommitment")),
    ]),
  });
}

async function receiverRequest<T>(
  signer: Keypair,
  method: "POST" | "PATCH",
  body: Record<string, unknown>,
): Promise<T> {
  const bodyText = JSON.stringify(body);
  const publicKey = signer.publicKey.toBase58();
  let challenge: Response;
  try {
    challenge = await fetch(`${receiver()}/api/cranker/auth/challenge`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ publicKey }),
    });
  } catch (error) {
    throw new Error(
      `Receiver challenge request failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  if (!challenge.ok) {
    const detail = (await challenge.text()).slice(0, 300);
    throw new Error(
      `Receiver challenge failed (${challenge.status}): ${detail}`,
    );
  }
  const data = (await challenge.json()) as { nonce?: string };
  if (!data.nonce) throw new Error("Receiver challenge is malformed");
  const timestamp = String(Math.floor(Date.now() / 1000));
  const digest = createHash("sha256").update(bodyText).digest("hex");
  const message = `TSN_RECEIVER_CRANKER_V1|${method}|/api/cranker/work|${timestamp}|${data.nonce}|${digest}`;
  const signature = Buffer.from(
    nacl.sign.detached(Buffer.from(message), signer.secretKey),
  ).toString("base64");
  const response = await fetch(`${receiver()}/api/cranker/work`, {
    method,
    headers: {
      "content-type": "application/json",
      "x-cranker-public-key": publicKey,
      "x-cranker-challenge": data.nonce,
      "x-cranker-timestamp": timestamp,
      "x-cranker-signature": signature,
    },
    body: bodyText,
  });
  if (!response.ok)
    throw new Error(
      `Receiver work request failed (${response.status}): ${(await response.text()).slice(0, 300)}`,
    );
  return (await response.json()) as T;
}

async function lease(signer: Keypair): Promise<Work | null> {
  const response = await receiverRequest<{ work: Work | null }>(
    signer,
    "POST",
    { supportedKinds: ["AUTHORIZED_FUNDING", "SETTLEMENT", "TIN_OPERATION"] },
  );
  return response.work;
}

async function report(
  signer: Keypair,
  work: Work,
  status: "CONFIRMED" | "FAILED",
  evidence: Record<string, unknown>,
) {
  const signature = typeof evidence.signature === "string" ? ` signature=${evidence.signature}` : "";
  crankerLog(`work report start id=${work.id} kind=${work.kind} status=${status}${signature}`);
  await receiverRequest(signer, "PATCH", {
    id: work.id,
    owner: signer.publicKey.toBase58(),
    expectedVersion: work.stateVersion,
    status,
    evidence,
  });
  crankerLog(`work report accepted id=${work.id} status=${status}`);
}

async function processAuthorizedFunding(
  signer: Keypair,
  work: Work,
  rpcUrl: string,
) {
  const payload = work.verification?.verifiedPayload;
  const encoded = payload?.senderSignedFundingTransaction;
  if (typeof encoded !== "string" || !encoded)
    throw new Error("Node did not provide the owner-signed TCAP deposit transaction");
  if (payload?.senderFundingMode !== "tcap_deposit_v2") throw new Error("Legacy funding modes are retired; expected TCAP deposit V2");
  const connection = createSolanaConnection(rpcUrl);
  const wire = Buffer.from(encoded, "base64");
  if (!wire.length || wire.toString("base64") !== encoded) throw new Error("Owner-signed TCAP deposit is not valid base64 transaction data");
  const tx = Transaction.from(wire);
  const ownerSignature = tx.signatures.find((item) => item.signature)?.signature;
  if (!ownerSignature) throw new Error("Owner-signed TCAP deposit signature is missing");
  const verifiedWire = tx.serialize({ requireAllSignatures: true, verifySignatures: true });
  if (!verifiedWire.equals(wire)) throw new Error("Cranker will not alter the owner-signed TCAP deposit transaction");
  const expectedSignature = bs58Encode(ownerSignature);
  crankerLog(`TCAP deposit submit start workId=${work.id} transactionBytes=${wire.length} ownerSignature=${expectedSignature}`);
  let signature: string;
  try {
    signature = await connection.sendRawTransaction(wire, { skipPreflight: false, preflightCommitment: "confirmed" });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!/already processed|already been processed/i.test(message)) throw error;
    signature = expectedSignature;
    crankerLog(`TCAP deposit replay detected workId=${work.id} signature=${signature}; checking chain status`);
  }
  if (signature !== expectedSignature) throw new Error("RPC returned a different signature for the owner-signed TCAP deposit");
  await confirmSignatureViaRpc(connection, signature, "TCAP deposit");
  crankerLog(`TCAP deposit confirmed workId=${work.id} signature=${signature}`);
  await report(signer, work, "CONFIRMED", {
    signature,
    stage: "TCAP_DEPOSIT_ASSET_V2_CONFIRMED",
  });
}

async function processSettlement(signer: Keypair, work: Work, rpcUrl: string) {
  const auth = work.authorization;
  if (auth?.kind === "TSN_CREDITCOIN_PAYOUT_AUTHORIZATION") {
    const authorization = auth.authorization;
    const signature = auth.signature ?? auth.authorizationSignature;
    if (
      !authorization ||
      typeof authorization !== "object" ||
      typeof signature !== "string"
    ) {
      throw new Error(
        "Creditcoin settlement work is missing authorization or signature",
      );
    }
    crankerLog(`Creditcoin settlement start id=${work.id}`);
    const result = await creditcoinCranker().submit(
      authorization as never,
      signature,
    );
    crankerLog(`Creditcoin settlement submitted id=${work.id} tx=${result.transactionHash}`);
    await report(signer, work, "CONFIRMED", {
      stage: "CREDITCOIN_SETTLEMENT_SUBMITTED",
      creditcoinTxHash: result.transactionHash,
      attestcoinMessageId: result.messageId,
    });
    return;
  }
  if (!auth || auth.kind !== "TSN_TCAP_GPRU_CREDIT_AUTHORIZATION_V2")
    throw new Error("Settlement has no verified TCAP GPRU credit authorization");
  const transition = auth.transition as Record<string, unknown> | undefined;
  if (!transition) throw new Error("Node TCAP V2 credit transition is missing");
  if (String(auth.leaseId ?? "") !== (work.crankerLease?.leaseId ?? work.id)
      || Number(auth.leaseVersion) !== Number(work.crankerLease?.version ?? work.stateVersion)
      || String(auth.leaseExpiresAt ?? "") !== String(work.crankerLease?.expiresAt ?? "")) {
    throw new Error("Node TCAP authorization does not match the active Receiver lease");
  }
  if (Number(auth.expiresAtTs ?? 0) <= Math.floor(Date.now() / 1000)) throw new Error("TCAP credit authorization expired");
  const authority = motherAuthority();
  const mother = await tsnFetchMotherEscrowOnChain(rpcUrl);
  if (!mother?.valid || mother.authority !== authority.publicKey.toBase58()) {
    throw new Error("Configured Mother authority keypair does not match the on-chain Mother Escrow authority");
  }
  const tipRootCommitment = String(transition.tipRootCommitment ?? "");
  const currentTip = new PublicKey(String(transition.tip ?? ""));
  const assetEntry = new PublicKey(String(transition.assetEntry ?? ""));
  const tcapConfig = new PublicKey(String(transition.tcapConfig ?? ""));
  const connection = createSolanaConnection(rpcUrl);
  const instruction = buildTsnRegisterTcapCreditAuthorizationV2Instruction({
    authority: authority.publicKey,
    motherEscrow: new PublicKey(mother.address),
    config: tcapConfig,
    tipRootCommitment,
    assetEntry,
    tip: currentTip,
    authorizationDigest: String(transition.authorizationDigest ?? ""),
    validAfterSlot: String(transition.validAfterSlot ?? ""),
    expiresAtSlot: String(transition.expiresAtSlot ?? ""),
    previousCommitment: String(transition.previousCommitment ?? ""),
    newCommitment: String(transition.newCommitment ?? ""),
    sequence: String(transition.sequence ?? ""),
    tokenId: Number(transition.tokenId),
    policyCommitment: String(transition.policyCommitment ?? ""),
    gpruScopeCommitment: String(transition.gpruScopeCommitment ?? ""),
    nullifier: String(transition.nullifier ?? ""),
  });
  const settlementInstructions = [instruction];
  const tipBeforeSettlement = await connection.getAccountInfo(currentTip, "confirmed");
  if (transition.initializeTip === true) {
    const initialCommitment = Buffer.from(hex32(transition.initialCommitment, "initialCommitment"));
    const previousCommitment = Buffer.from(hex32(transition.previousCommitment, "previousCommitment"));
    if (String(transition.sequence) !== "1" || !initialCommitment.equals(previousCommitment)) {
      throw new Error("TCAP_FIRST_CREDIT_INITIAL_STATE_MISMATCH");
    }
    if (!tipBeforeSettlement) {
      settlementInstructions.unshift(buildInitializeTcapTinTipInstruction({
        payer: signer.publicKey,
        motherEscrow: new PublicKey(mother.address),
        cranker: getTsnCrankerPda({
          motherEscrow: new PublicKey(mother.address),
          operator: signer.publicKey,
        }),
        tip: currentTip,
        tipRootCommitment,
        initialCommitment: initialCommitment.toString("hex"),
        policyCommitment: String(transition.policyCommitment ?? ""),
      }));
      crankerLog(`TCAP TIN TIP initialization queued before first credit workId=${work.id}`);
    } else {
      const expectedTipDiscriminator = hash("account:TCapTinTipV1").subarray(0, 8);
      const tipData = tipBeforeSettlement.data;
      if (!tipBeforeSettlement.owner.equals(TCAP_PROGRAM_ID)
          || tipData.length !== 116 || !tipData.subarray(0, 8).equals(expectedTipDiscriminator)
          || !tipData.subarray(10, 42).equals(initialCommitment)
          || tipData.readBigUInt64LE(42) !== 0n
          || !tipData.subarray(50, 82).equals(Buffer.from(hex32(transition.policyCommitment, "policyCommitment")))
          || !tipData.subarray(82, 114).equals(Buffer.alloc(32)) || tipData[114] !== 0) {
        throw new Error("TCAP_TIN_TIP_CHANGED_BEFORE_FIRST_CREDIT");
      }
    }
  } else if (!tipBeforeSettlement) {
    throw new Error("TCAP_TIN_TIP_MISSING_WITHOUT_NODE_INITIALIZATION_AUTHORIZATION");
  }
  const signature = await sendCrankerInstruction(
    connection,
    signer,
    settlementInstructions,
    transition.initializeTip === true ? "TCAP_TIN_TIP_INIT_AND_GPRU_CREDIT_V2" : "TCAP_GPRU_TIN_TIP_CREDIT_V2",
    [authority],
  );
  const tip = currentTip;
  const tipAccount = await connection.getAccountInfo(tip, "confirmed");
  const tipData = tipAccount?.data;
  const expectedTipDiscriminator = createHash("sha256").update("account:TCapTinTipV1").digest().subarray(0, 8);
  if (!tipAccount || !tipAccount.owner.equals(TCAP_PROGRAM_ID) || !tipData
      || tipData.length !== 116 || !tipData.subarray(0, 8).equals(expectedTipDiscriminator)
      || !tipData.subarray(10, 42).equals(Buffer.from(String(transition.newCommitment), "hex"))
      || tipData.readBigUInt64LE(42) !== BigInt(String(transition.sequence))
      || !tipData.subarray(50, 82).equals(Buffer.from(String(transition.policyCommitment), "hex"))
      || !tipData.subarray(82, 114).equals(Buffer.from(String(transition.nullifier), "hex"))
      || tipData[114] !== 0) {
    throw new Error("Confirmed transaction did not apply the authorized TCAP V2 TIN TIP transition");
  }
  crankerLog(`TCAP GPRU credit confirmed workId=${work.id} signature=${signature} sequence=${String(transition.sequence)} tokenId=${String(transition.tokenId)}`);
  await report(signer, work, "CONFIRMED", {
    signature,
    stage: "TCAP_GPRU_TIN_TIP_CREDIT_V2_CONFIRMED",
    sequence: String(transition.sequence),
    authorizationDigest: String(transition.authorizationDigest),
  });
}

function base64Bytes(value: unknown, field: string, allowEmpty = false) {
  if (typeof value !== "string" || (!allowEmpty && !value))
    throw new Error(`TIN operation is missing ${field}`);
  return Buffer.from(value, "base64");
}

function legacyTransactionWireSize(tx: Transaction, feePayer: PublicKey) {
  const shortVecLength = (length: number) => {
    let bytes = 1;
    for (let value = length; value >= 0x80; value >>= 7) bytes += 1;
    return bytes;
  };
  const originalFeePayer = tx.feePayer;
  const originalBlockhash = tx.recentBlockhash;
  try {
    tx.feePayer = feePayer;
    // A blockhash is always 32 bytes, so a fixed valid public key is enough
    // to measure the message without making an RPC call or signing it.
    tx.recentBlockhash = SystemProgram.programId.toBase58();
    const message = tx.compileMessage();
    const messageBytes =
      3 +
      shortVecLength(message.accountKeys.length) +
      message.accountKeys.length * 32 +
      32 +
      shortVecLength(tx.instructions.length) +
      tx.instructions.reduce(
        (total, instruction) =>
          total +
          1 +
          shortVecLength(instruction.keys.length) +
          instruction.keys.length +
          shortVecLength(instruction.data.length) +
          instruction.data.length,
        0,
      );
    return (
      shortVecLength(message.header.numRequiredSignatures) +
      message.header.numRequiredSignatures * 64 +
      messageBytes
    );
  } finally {
    tx.feePayer = originalFeePayer;
    tx.recentBlockhash = originalBlockhash;
  }
}

async function sendCrankerInstruction(
  connection: Connection,
  signer: Keypair,
  instructions: TransactionInstruction | TransactionInstruction[],
  label: string,
  additionalSigners: Keypair[] = [],
) {
  const tx = new Transaction().add(...(Array.isArray(instructions) ? instructions : [instructions]));
  tx.feePayer = signer.publicKey;
  const size = legacyTransactionWireSize(tx, signer.publicKey);
  if (size > 1232) {
    throw new Error(`TSN staging instruction is ${size} bytes, over Solana's 1232-byte packet limit`);
  }
  crankerLog(`tx submit step=${label} bytes=${size}/1232`);
  const signature = await connection.sendTransaction(tx, [signer, ...additionalSigners], {
    skipPreflight: false,
  });
  crankerLog(`tx sent step=${label} signature=${signature}`);
  try { await confirmSignatureViaRpc(connection, signature, label); }
  catch (error) { crankerLog(`tx confirmation failed step=${label} signature=${signature} error=${error instanceof Error ? error.message : String(error)}`); throw error; }
  crankerLog(`tx confirmed step=${label} signature=${signature}`);
  return signature;
}

async function submitStagedTinV1Creation(params: {
  connection: Connection;
  signer: Keypair;
  programId: PublicKey;
  owner: PublicKey;
  registry: PublicKey;
  payload: Record<string, unknown>;
  intentHash: Buffer | Uint8Array;
  identityEnvelope: Buffer;
  recoveryEnvelope: Buffer;
  masterSeed: Buffer;
  ownerProof: TransactionInstruction;
}) {
  const {
    connection,
    signer,
    programId,
    owner,
    registry,
    payload,
    intentHash,
    identityEnvelope,
    recoveryEnvelope,
    masterSeed,
    ownerProof,
  } = params;
  const stage = getTinV1CreationStagingPda(owner, intentHash, programId);
  const stageParams = serializeTinV1CreationStageParams({
    ownerPubkey: owner,
    lookupCommitment: hex32(payload.lookupCommitment, "lookupCommitment"),
    intentHash,
    encryptedIdentityEnvelopeLength: identityEnvelope.length,
    encryptedTinRecoveryLength: recoveryEnvelope.length,
    encryptedMasterSeedLength: masterSeed.length,
    encryptedMetadataHash: hex32(payload.encryptedMetadataHash, "encryptedMetadataHash"),
    routeVersion: BigInt(String(payload.routeVersion)),
    routeNonce: hex32(payload.routeNonce, "routeNonce"),
    tcapRouteVersion: 1,
    tcapRelationshipCommitment: hex32(payload.tcapRelationshipCommitment, "tcapRelationshipCommitment"),
    tcapRelationshipReference: hex32(payload.tcapRelationshipReference, "tcapRelationshipReference"),
    tcapPolicyCommitment: hex32(payload.tcapPolicyCommitment, "tcapPolicyCommitment"),
    expiryTs: BigInt(String(payload.expiry)),
  });
  const stageSig = await sendCrankerInstruction(
    connection,
    signer,
    new TransactionInstruction({
      programId,
      keys: [
        { pubkey: signer.publicKey, isSigner: true, isWritable: true },
        { pubkey: stage, isSigner: false, isWritable: true },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      data: stageParams,
    }),
    "tin-v1.stage.initialize",
  );
  crankerLog(`TIN stage initialized workId=${String(payload.intentId ?? "unknown")} address=${stage.toBase58()}`);
  const chunkSigs = [stageSig];
  const blobs = [
    ["identity", identityEnvelope] as const,
    ["owner_recovery", recoveryEnvelope] as const,
    ["master_seed", masterSeed] as const,
  ];
  for (const [kind, blob] of blobs) {
    for (let offset = 0; offset < blob.length; offset += 700) {
      const data = serializeTinV1CreationChunkParams({
        kind,
        offset,
        bytes: blob.subarray(offset, offset + 700),
      });
      const signature = await sendCrankerInstruction(
        connection,
        signer,
        new TransactionInstruction({
          programId,
          keys: [
            { pubkey: signer.publicKey, isSigner: true, isWritable: true },
            { pubkey: stage, isSigner: false, isWritable: true },
          ],
          data,
        }),
        `tin-v1.stage.chunk.${kind}.offset-${offset}.length-${Math.min(700, blob.length - offset)}`,
      );
      chunkSigs.push(signature);
    }
    crankerLog(`TIN stage blob complete kind=${kind} bytes=${blob.length}`);
  }

  const finalData = serializeTinV1CreationFinalizeParams({ intentHash });
  const finalizeInstruction = new TransactionInstruction({
    programId,
    keys: [
      { pubkey: signer.publicKey, isSigner: true, isWritable: true },
      { pubkey: getTinsGlobalStatePda(programId), isSigner: false, isWritable: true },
      { pubkey: registry, isSigner: false, isWritable: true },
      { pubkey: getTinV1OwnerRecoveryPda(owner, programId), isSigner: false, isWritable: true },
      { pubkey: SYSVAR_INSTRUCTIONS_PUBKEY, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: stage, isSigner: false, isWritable: true },
    ],
    data: finalData,
  });
  const signature = await sendCrankerInstruction(
    connection,
    signer,
    [ownerProof, finalizeInstruction],
    "tin-v1.stage.finalize",
  );
  return { signature, stage: stage.toBase58(), stagingSignatures: chunkSigs };
}

async function processTinOperation(
  signer: Keypair,
  work: Work,
  rpcUrl: string,
) {
  const payload = work.verification?.verifiedPayload;
  if (!payload || payload.intentType !== "tin_creation") {
    throw new Error(
      "Only verified tin_creation operations are executable by the Cranker",
    );
  }
  if (Number(payload.tcapRouteVersion) !== 1) {
    throw new Error("Cranker accepts only the current TIN GPRU route version");
  }
  const programId = new PublicKey(
    process.env.TINS_PROGRAM_ID ||
      "TinseNnU588NkmRZBe4ADJbxqrqQma92678UFP6VuwT",
  );
  const owner = new PublicKey(String(payload.ownerPubkey));
  // TIN V1 keeps the human TIN inside the encrypted identity envelope.
  if (
    typeof payload.lookupCommitment !== "string" ||
    !payload.lookupCommitment ||
    typeof payload.encryptedIdentityEnvelope !== "string" ||
    !payload.encryptedIdentityEnvelope ||
    typeof payload.encryptedTinRecovery !== "string" ||
    !payload.encryptedTinRecovery ||
    payload.tin
  ) {
    throw new Error("Cranker accepts only verified private TIN V1 creation work with encrypted identity data");
  }
  const lookupCommitment = hex32(payload.lookupCommitment, "lookupCommitment");
  const intentHash = hex32(payload.ownerIntentHash, "ownerIntentHash");
  const identityEnvelope = base64Bytes(payload.encryptedIdentityEnvelope, "encryptedIdentityEnvelope");
  const recoveryEnvelope = base64Bytes(payload.encryptedTinRecovery, "encryptedTinRecovery");
  const masterSeed = base64Bytes(payload.encryptedMasterSeed, "encryptedMasterSeed");
  const registry = PublicKey.findProgramAddressSync(
    [Buffer.from("tin-v1"), lookupCommitment],
    programId,
  )[0];
  const instructionData = serializeTinV1CreationParams({
    ownerPubkey: owner,
    lookupCommitment,
    encryptedTinRecovery: recoveryEnvelope,
    encryptedIdentityEnvelope: identityEnvelope,
    encryptedMasterSeed: masterSeed,
    encryptedMetadataHash: hex32(payload.encryptedMetadataHash, "encryptedMetadataHash"),
    routeVersion: BigInt(String(payload.routeVersion)),
    routeNonce: hex32(payload.routeNonce, "routeNonce"),
    tcapRouteVersion: 1,
    tcapRelationshipCommitment: hex32(payload.tcapRelationshipCommitment, "tcapRelationshipCommitment"),
    tcapRelationshipReference: hex32(payload.tcapRelationshipReference, "tcapRelationshipReference"),
    tcapPolicyCommitment: hex32(payload.tcapPolicyCommitment, "tcapPolicyCommitment"),
    intentHash,
    expiryTs: BigInt(String(payload.expiry)),
  });
  const connection = createSolanaConnection(rpcUrl);
  const ownerSignature = base64Bytes(payload.ownerSignature, "ownerSignature");
  if (typeof payload.ownerIntentMessage !== "string" || payload.ownerIntentMessage.length === 0) {
    throw new Error("Verified TIN owner approval message is missing");
  }
  const signatureMessage = Buffer.from(payload.ownerIntentMessage, "utf8");
  const ownerProof = Ed25519Program.createInstructionWithPublicKey({
    publicKey: owner.toBytes(),
    message: signatureMessage,
    signature: ownerSignature,
  });
  const tinInstruction = new TransactionInstruction({
    programId,
    keys: [
      { pubkey: signer.publicKey, isSigner: true, isWritable: true },
      {
        pubkey: getTinsGlobalStatePda(programId),
        isSigner: false,
        isWritable: true,
      },
      { pubkey: registry, isSigner: false, isWritable: true },
      { pubkey: getTinV1OwnerRecoveryPda(owner, programId), isSigner: false, isWritable: true },
      {
        pubkey: SYSVAR_INSTRUCTIONS_PUBKEY,
        isSigner: false,
        isWritable: false,
      },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: Buffer.from(instructionData),
  });
  const tx = new Transaction().add(ownerProof, tinInstruction);
  const transactionBytes = legacyTransactionWireSize(tx, signer.publicKey);
  crankerLog(
    `TIN creation start workId=${work.id} registry=${registry.toBase58()} recovery=${getTinV1OwnerRecoveryPda(owner, programId).toBase58()} txBytes=${transactionBytes} path=${transactionBytes > 1232 ? "staged" : "direct"} identityBytes=${identityEnvelope.length} recoveryBytes=${recoveryEnvelope.length} seedBytes=${masterSeed.length}`,
  );
  let signature: string;
  let staging: { stage: string; stagingSignatures: string[] } | null = null;
  if (transactionBytes > 1232) {
    const result = await submitStagedTinV1Creation({
      connection,
      signer,
      programId,
      owner,
      registry,
      payload,
      intentHash,
      identityEnvelope,
      recoveryEnvelope,
      masterSeed,
      ownerProof,
    });
    signature = result.signature;
    staging = { stage: result.stage, stagingSignatures: result.stagingSignatures };
  } else {
    crankerLog(`tx submit step=tin-v1.create-direct bytes=${transactionBytes}/1232`);
    signature = await connection.sendTransaction(tx, [signer], {
      skipPreflight: false,
    });
    crankerLog(`tx sent step=tin-v1.create-direct signature=${signature}`);
    try {
      await connection.confirmTransaction(signature, "confirmed");
    } catch (error) {
      crankerLog(`tx confirmation failed step=tin-v1.create-direct signature=${signature} error=${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
    crankerLog(`tx confirmed step=tin-v1.create-direct signature=${signature}`);
  }
  crankerLog(`TIN create transaction confirmed workId=${work.id} signature=${signature}`);
  const createdAccount = await connection.getAccountInfo(registry, "confirmed");
  if (!createdAccount || !createdAccount.owner.equals(programId))
    throw new Error("CreateTinV1 confirmed but the registry account was not found under the TIN program");
  if (createdAccount.data.length < 40 || createdAccount.data[0] !== 1 || createdAccount.data[2] !== 1
      || !createdAccount.data.subarray(8, 40).equals(lookupCommitment))
    throw new Error("CreateTinV1 registry account failed the V1 version, status, or lookup commitment check");
  crankerLog(`TIN registry verified workId=${work.id} registry=${registry.toBase58()} version=1 status=active accountBytes=${createdAccount.data.length}`);
  await report(signer, work, "CONFIRMED", {
    stage: "TIN_V1_REGISTRY_CREATED",
    signature,
    registry: registry.toBase58(),
    ...(staging ? { stagedCreation: staging } : {}),
  });
}

async function main() {
  const signer = operator();
  await selectReceiver();
  const { rpcUrl, mother } = await resolveWorkingSolanaRpcUrl();
  const cranker = getTsnCrankerPda({
    motherEscrow: new PublicKey(mother.address),
    operator: signer.publicKey,
  });
  console.log(
    `[tsn-cranker] operator=${signer.publicKey.toBase58()} cranker=${cranker.toBase58()} receiver=${receiver()}`,
  );
  for (;;) {
    try {
      const work = await lease(signer);
      if (!work) {
        await new Promise((resolve) =>
          setTimeout(resolve, Number(process.env.TSN_CRANKER_POLL_MS ?? 2000)),
        );
        continue;
      }
      crankerLog(`work leased id=${work.id} kind=${work.kind} stateVersion=${work.stateVersion}`);
      try {
        verifyNodeAttestation(work);
        if (work.kind === "AUTHORIZED_FUNDING")
          await processAuthorizedFunding(signer, work, rpcUrl);
        else if (work.kind === "TIN_OPERATION")
          await processTinOperation(signer, work, rpcUrl);
        else await processSettlement(signer, work, rpcUrl);
      } catch (error) {
        crankerLog(`work processing failed id=${work.id} kind=${work.kind} error=${error instanceof Error ? error.message : String(error)}`);
        await report(signer, work, "FAILED", {
          reason: error instanceof Error ? error.message : String(error),
        }).catch(() => undefined);
        console.error(error);
      }
    } catch (error) {
      console.error(
        `[tsn-cranker] poll failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      await new Promise((resolve) => setTimeout(resolve, 3000));
    }
  }
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
