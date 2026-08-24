import type { Hex32, TcapTipStateV1 } from "./snapshots.js";

export type SolanaAccountInfo = Readonly<{
  owner: string;
  lamports: number;
  data: readonly [string, string];
}>;

export type SolanaRpcResponse<T> = Readonly<{
  jsonrpc: string;
  id: number | string;
  result?: T;
  error?: Readonly<{ code: number; message: string }>;
}>;

export type DecodedTcapTinTipV1 = TcapTipStateV1 & Readonly<{
  version: number;
  policy_commitment: Hex32;
  last_transition_nullifier: Hex32;
  frozen: boolean;
  bump: number;
  address: string;
  owner: string;
  lamports: number;
}>;

const ACCOUNT_DISCRIMINATOR_DOMAIN = "account:TCapTinTipV1";

function fail(message: string): never {
  throw new Error(message);
}

function decodeBase64(value: string): Uint8Array {
  const binary = globalThis.atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function hex(bytes: Uint8Array): Hex32 {
  if (bytes.length !== 32) fail("tip_commitment_length_invalid");
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("") as Hex32;
}

function readU16(bytes: Uint8Array, offset: number): number {
  return new DataView(bytes.buffer, bytes.byteOffset + offset, 2).getUint16(0, false);
}

function readU64(bytes: Uint8Array, offset: number): bigint {
  return new DataView(bytes.buffer, bytes.byteOffset + offset, 8).getBigUint64(0, false);
}

async function accountDiscriminator(): Promise<Uint8Array> {
  const digest = await globalThis.crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(ACCOUNT_DISCRIMINATOR_DOMAIN) as BufferSource,
  );
  return new Uint8Array(digest).slice(0, 8);
}

function equalBytes(left: Uint8Array, right: Uint8Array): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

export function decodeTcapTinTipV1Account(
  address: string,
  info: SolanaAccountInfo,
  expectedOwner?: string,
  expectedDiscriminator?: Uint8Array,
): DecodedTcapTinTipV1 {
  if (expectedOwner && info.owner !== expectedOwner) fail("tip_account_owner_mismatch");
  if (!Array.isArray(info.data) || info.data[1] !== "base64") fail("tip_account_encoding_unsupported");
  const bytes = decodeBase64(info.data[0]);
  if (bytes.length !== 116) fail("tip_account_length_invalid");
  if (expectedDiscriminator && !equalBytes(bytes.slice(0, 8), expectedDiscriminator)) {
    fail("tip_account_discriminator_mismatch");
  }
  const version = readU16(bytes, 8);
  if (version !== 1) fail("tip_account_version_unsupported");
  return {
    address,
    owner: info.owner,
    lamports: info.lamports,
    version,
    current_commitment: hex(bytes.slice(10, 42)),
    sequence: readU64(bytes, 42),
    policy_commitment: hex(bytes.slice(50, 82)),
    last_transition_nullifier: hex(bytes.slice(82, 114)),
    frozen: bytes[114] !== 0,
    bump: bytes[115],
  };
}

export async function fetchTcapTinTipV1(params: Readonly<{
  rpcUrl: string;
  address: string;
  expectedProgramId?: string;
  fetchImpl?: typeof fetch;
}>): Promise<DecodedTcapTinTipV1> {
  const fetchImpl = params.fetchImpl ?? globalThis.fetch;
  if (!fetchImpl) fail("fetch_unavailable");
  const response = await fetchImpl(params.rpcUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "getAccountInfo",
      params: [params.address, { encoding: "base64", commitment: "confirmed" }],
    }),
  });
  if (!response.ok) fail(`solana_rpc_http_${response.status}`);
  const payload = await response.json() as SolanaRpcResponse<Readonly<{ value: SolanaAccountInfo | null }>>;
  if (payload.error) fail(`solana_rpc_${payload.error.code}:${payload.error.message}`);
  const info = payload.result?.value;
  if (!info) fail("tip_account_not_found");
  return decodeTcapTinTipV1Account(
    params.address,
    info,
    params.expectedProgramId,
    await accountDiscriminator(),
  );
}
