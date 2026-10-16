import { createHash } from "node:crypto";

import { TOKEN_PROGRAM_ID as SPL_TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { Connection, Keypair, PublicKey, Transaction } from "@solana/web3.js";

import { VERIFIED_TSN_PROGRAM_ID } from "../program.js";
import { resolveSolanaRpcUrl } from "../rpc.js";

export const TOKEN_PROGRAM_ID = SPL_TOKEN_PROGRAM_ID;

export function instructionDiscriminator(name: string) {
  return createHash("sha256").update(`global:${name}`).digest().subarray(0, 8);
}

export function getEscrowAuthorityKeypair(secretKeyValue?: string | null): Keypair {
  const rawValue = secretKeyValue?.trim();

  if (!rawValue) {
    throw new Error("Missing secret key");
  }

  let secretKey: Uint8Array;
  try {
    const values = JSON.parse(rawValue) as number[];
    secretKey = Uint8Array.from(values);
  } catch {
    if (rawValue.includes(",")) {
      const values = rawValue
        .split(",")
        .map((entry) => Number(entry.trim()))
        .filter((value) => Number.isFinite(value));
      if (values.length > 0) {
        secretKey = Uint8Array.from(values);
      } else {
        throw new Error("Invalid secret key format");
      }
    } else {
      const hashed = createHash("sha256").update(rawValue).digest();
      secretKey = Uint8Array.from(hashed);
    }
  }

  try {
    if (secretKey.length >= 64) {
      return Keypair.fromSecretKey(secretKey.slice(0, 64));
    }
  } catch {
    // fall through
  }
  const seed =
    secretKey.length >= 32 ? secretKey.slice(0, 32) : createHash("sha256").update(secretKey).digest().slice(0, 32);
  return Keypair.fromSeed(Uint8Array.from(seed));
}

export function getConnection(rpcUrl?: string) {
  const normalizedRpcUrl = !rpcUrl || rpcUrl === "http://127.0.0.1:8899"
    ? resolveSolanaRpcUrl({ frontendSafe: false })
    : rpcUrl;
  let wsEndpoint = process.env.TSN_RPC_WS_URL?.trim();
  if (!wsEndpoint) {
    const endpoint = new URL(normalizedRpcUrl);
    endpoint.protocol = endpoint.protocol === "https:" ? "wss:" : "ws:";
    const localHost = ["localhost", "127.0.0.1", "::1"].includes(endpoint.hostname);
    const configuredPath = process.env.TSN_RPC_GATEWAY_WS_PATH?.trim();
    if ((endpoint.pathname === "/" || endpoint.pathname === "") && (localHost || configuredPath)) {
      endpoint.pathname = configuredPath || "/ws";
    }
    wsEndpoint = endpoint.toString();
  }
  return new Connection(
    normalizedRpcUrl,
    { commitment: "confirmed", wsEndpoint },
  );
}

export function getProgramId() {
  return new PublicKey(VERIFIED_TSN_PROGRAM_ID);
}

export async function estimateTransactionFeeLamports(connection: Connection, transaction: Transaction) {
  const fee = await connection.getFeeForMessage(transaction.compileMessage(), "confirmed");
  return fee.value ?? 0;
}

export async function getEscrowConfigState() {
  // TSN protocol module does not depend on backend escrow config storage.
  // If needed later, this can read the on-chain config account directly.
  return null as { treasuryOwner: string | null } | null;
}
