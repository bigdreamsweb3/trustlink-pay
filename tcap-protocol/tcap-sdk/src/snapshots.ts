/**
 * Private TCap balance snapshots.
 *
 * The encrypted envelope is safe to persist in an owner-authorized store. It
 * deliberately has no `token_balances` property: balances exist only in the
 * decrypted snapshot returned by `readPrivateTcapBalance`.
 */

export const TCAP_BALANCE_SNAPSHOT_VERSION_V1 = 1 as const;
const SNAPSHOT_DOMAIN = "TCAP_BALANCE_SNAPSHOT_V1";
const ZERO_COMMITMENT = "0".repeat(64);

export type Hex32 = string & { readonly __hex32: unique symbol };

export type TcapTokenBalanceV1 = Readonly<{
  token_id: number;
  native_amount: bigint;
  stable_units: bigint;
  stable_rate_version: number;
}>;

/** Plaintext type. Never persist or return this from a public endpoint. */
export type TcapBalanceSnapshotV1 = Readonly<{
  version: typeof TCAP_BALANCE_SNAPSHOT_VERSION_V1;
  sequence: bigint;
  previous_commitment: Hex32;
  new_commitment: Hex32;
  token_balances: readonly TcapTokenBalanceV1[];
  policy_commitment: Hex32;
  transition_nullifier: Hex32;
  tsn_settlement_commitment: Hex32;
  created_at: bigint;
  encrypted_record_locator: string;
}>;

/** Persistable envelope. Token balances are inside `ciphertext`, not fields. */
export type EncryptedTCapBalanceSnapshotV1 = Readonly<{
  version: typeof TCAP_BALANCE_SNAPSHOT_VERSION_V1;
  sequence: bigint;
  previous_commitment: Hex32;
  new_commitment: Hex32;
  policy_commitment: Hex32;
  transition_nullifier: Hex32;
  tsn_settlement_commitment: Hex32;
  created_at: bigint;
  encrypted_record_locator: string;
  nonce: Uint8Array;
  ciphertext: Uint8Array;
}>;

export type TcapTipStateV1 = Readonly<{
  current_commitment: Hex32 | Uint8Array;
  sequence: bigint | number;
}>;

export type TcapSnapshotStore = Readonly<{
  load: (commitment: Hex32) => Promise<EncryptedTCapBalanceSnapshotV1 | null>;
}>;

function fail(message: string): never {
  throw new Error(message);
}

function bytesFromHex(value: string, label: string): Uint8Array {
  if (!/^[0-9a-f]{64}$/i.test(value)) fail(`${label}_must_be_32_byte_hex`);
  const bytes = new Uint8Array(32);
  for (let index = 0; index < 32; index += 1) {
    bytes[index] = Number.parseInt(value.slice(index * 2, index * 2 + 2), 16);
  }
  return bytes;
}

function hexFromBytes(value: Uint8Array): Hex32 {
  if (value.length !== 32) fail("commitment_must_be_32_bytes");
  return Array.from(value, (byte) => byte.toString(16).padStart(2, "0")).join("") as Hex32;
}

function normalizeCommitment(value: Hex32 | Uint8Array, label: string): Hex32 {
  if (value instanceof Uint8Array) return hexFromBytes(value);
  bytesFromHex(value, label);
  return value.toLowerCase() as Hex32;
}

function u32(value: number, label: string): Uint8Array {
  if (!Number.isSafeInteger(value) || value < 0 || value > 0xffff_ffff) fail(`${label}_invalid`);
  const output = new Uint8Array(4);
  new DataView(output.buffer).setUint32(0, value, false);
  return output;
}

function u64(value: bigint, label: string): Uint8Array {
  if (value < 0n || value > 0xffff_ffff_ffff_ffffn) fail(`${label}_invalid`);
  const output = new Uint8Array(8);
  new DataView(output.buffer).setBigUint64(0, value, false);
  return output;
}

function frame(value: Uint8Array): Uint8Array {
  return new Uint8Array([...u32(value.length, "field_length"), ...value]);
}

function concat(...values: readonly Uint8Array[]): Uint8Array {
  const output = new Uint8Array(values.reduce((sum, value) => sum + value.length, 0));
  let offset = 0;
  for (const value of values) {
    output.set(value, offset);
    offset += value.length;
  }
  return output;
}

function validateSnapshot(snapshot: TcapBalanceSnapshotV1): void {
  if (snapshot.version !== TCAP_BALANCE_SNAPSHOT_VERSION_V1) fail("unsupported_snapshot_version");
  bytesFromHex(snapshot.previous_commitment, "previous_commitment");
  bytesFromHex(snapshot.new_commitment, "new_commitment");
  bytesFromHex(snapshot.policy_commitment, "policy_commitment");
  bytesFromHex(snapshot.transition_nullifier, "transition_nullifier");
  bytesFromHex(snapshot.tsn_settlement_commitment, "tsn_settlement_commitment");
  if (snapshot.sequence < 0n || snapshot.created_at < 0n) fail("snapshot_number_invalid");
  if (snapshot.encrypted_record_locator.length === 0) fail("encrypted_record_locator_empty");
  const seen = new Set<number>();
  for (const balance of snapshot.token_balances) {
    if (!Number.isSafeInteger(balance.token_id) || balance.token_id < 1) fail("token_id_invalid");
    if (seen.has(balance.token_id)) fail("duplicate_token_id");
    seen.add(balance.token_id);
    if (balance.native_amount < 0n || balance.stable_units < 0n) fail("negative_balance");
    if (!Number.isSafeInteger(balance.stable_rate_version) || balance.stable_rate_version < 1) {
      fail("stable_rate_version_invalid");
    }
  }
}

/** Canonical bytes used for the commitment. Array order is normalized by token_id. */
export function serializeTcapBalanceCommitmentRecordV1(snapshot: TcapBalanceSnapshotV1): Uint8Array {
  validateSnapshot(snapshot);
  const balances = [...snapshot.token_balances].sort((left, right) => left.token_id - right.token_id);
  const encoder = new TextEncoder();
  return concat(
    frame(encoder.encode(SNAPSHOT_DOMAIN)),
    u32(snapshot.version, "version"),
    u64(snapshot.sequence, "sequence"),
    bytesFromHex(snapshot.previous_commitment, "previous_commitment"),
    bytesFromHex(snapshot.policy_commitment, "policy_commitment"),
    bytesFromHex(snapshot.transition_nullifier, "transition_nullifier"),
    bytesFromHex(snapshot.tsn_settlement_commitment, "tsn_settlement_commitment"),
    u64(snapshot.created_at, "created_at"),
    frame(encoder.encode(snapshot.encrypted_record_locator)),
    u32(balances.length, "balance_count"),
    ...balances.map((balance) => concat(
      u32(balance.token_id, "token_id"),
      u64(balance.native_amount, "native_amount"),
      u64(balance.stable_units, "stable_units"),
      u32(balance.stable_rate_version, "stable_rate_version"),
    )),
  );
}

/** Encrypted payload encoding. `new_commitment` is carried here but excluded
 * from the commitment record to avoid a circular hash. */
export function serializeTcapBalanceSnapshotV1(snapshot: TcapBalanceSnapshotV1): Uint8Array {
  return concat(
    frame(bytesFromHex(snapshot.new_commitment, "new_commitment")),
    serializeTcapBalanceCommitmentRecordV1(snapshot),
  );
}

/** SHA-256 commitment; the resulting digest is the value expected in tip.current_commitment. */
export async function computeTcapBalanceSnapshotCommitment(
  snapshot: TcapBalanceSnapshotV1,
): Promise<Hex32> {
  const digest = await globalThis.crypto.subtle.digest(
    "SHA-256",
    serializeTcapBalanceCommitmentRecordV1(snapshot) as BufferSource,
  );
  return hexFromBytes(new Uint8Array(digest));
}

export function assertSnapshotMatchesTip(
  snapshot: TcapBalanceSnapshotV1,
  tip: TcapTipStateV1,
): void {
  const tipCommitment = normalizeCommitment(tip.current_commitment, "tip_commitment");
  const tipSequence = typeof tip.sequence === "number" ? BigInt(tip.sequence) : tip.sequence;
  if (snapshot.new_commitment.toLowerCase() !== tipCommitment) fail("snapshot_commitment_mismatch");
  if (snapshot.sequence !== tipSequence) fail("snapshot_sequence_mismatch");
}

function randomBytes(length: number): Uint8Array {
  const output = new Uint8Array(length);
  globalThis.crypto.getRandomValues(output);
  return output;
}

export async function importTcapSnapshotKey(rawKey: Uint8Array): Promise<CryptoKey> {
  if (![16, 24, 32].includes(rawKey.length)) fail("snapshot_key_must_be_128_192_or_256_bits");
  return globalThis.crypto.subtle.importKey("raw", rawKey as BufferSource, "AES-GCM", false, ["encrypt", "decrypt"]);
}

export async function encryptTcapBalanceSnapshotV1(
  snapshot: TcapBalanceSnapshotV1,
  key: CryptoKey,
): Promise<EncryptedTCapBalanceSnapshotV1> {
  const nonce = randomBytes(12);
  const ciphertext = await globalThis.crypto.subtle.encrypt(
    { name: "AES-GCM", iv: nonce as BufferSource },
    key,
    serializeTcapBalanceSnapshotV1(snapshot) as BufferSource,
  );
  return {
    version: snapshot.version,
    sequence: snapshot.sequence,
    previous_commitment: snapshot.previous_commitment,
    new_commitment: snapshot.new_commitment,
    policy_commitment: snapshot.policy_commitment,
    transition_nullifier: snapshot.transition_nullifier,
    tsn_settlement_commitment: snapshot.tsn_settlement_commitment,
    created_at: snapshot.created_at,
    encrypted_record_locator: snapshot.encrypted_record_locator,
    nonce,
    ciphertext: new Uint8Array(ciphertext),
  };
}

/** Decrypts locally and verifies the plaintext hash and all envelope bindings. */
export async function decryptTcapBalanceSnapshotV1(
  envelope: EncryptedTCapBalanceSnapshotV1,
  key: CryptoKey,
): Promise<TcapBalanceSnapshotV1> {
  if (envelope.version !== TCAP_BALANCE_SNAPSHOT_VERSION_V1 || envelope.nonce.length !== 12) {
    fail("invalid_encrypted_snapshot_envelope");
  }
  return decryptAndVerifyTcapBalanceSnapshotV1(envelope, key);
}

export type TcapSnapshotDecoder = (canonicalBytes: Uint8Array) => TcapBalanceSnapshotV1;

export const decodeTcapBalanceSnapshotV1: TcapSnapshotDecoder = decodeCanonicalTcapBalanceSnapshotV1;

export async function decryptAndVerifyTcapBalanceSnapshotV1(
  envelope: EncryptedTCapBalanceSnapshotV1,
  key: CryptoKey,
  decode: TcapSnapshotDecoder = decodeCanonicalTcapBalanceSnapshotV1,
): Promise<TcapBalanceSnapshotV1> {
  const plaintext = await globalThis.crypto.subtle.decrypt(
    { name: "AES-GCM", iv: envelope.nonce as BufferSource },
    key,
    envelope.ciphertext as BufferSource,
  );
  const snapshot = decode(new Uint8Array(plaintext));
  if (
    snapshot.version !== envelope.version
    || snapshot.sequence !== envelope.sequence
    || snapshot.new_commitment !== envelope.new_commitment
    || snapshot.previous_commitment !== envelope.previous_commitment
    || snapshot.policy_commitment !== envelope.policy_commitment
    || snapshot.transition_nullifier !== envelope.transition_nullifier
    || snapshot.tsn_settlement_commitment !== envelope.tsn_settlement_commitment
    || snapshot.created_at !== envelope.created_at
    || snapshot.encrypted_record_locator !== envelope.encrypted_record_locator
  ) fail("snapshot_envelope_binding_mismatch");
  const commitment = await computeTcapBalanceSnapshotCommitment(snapshot);
  if (commitment !== snapshot.new_commitment.toLowerCase()) fail("snapshot_commitment_mismatch");
  return snapshot;
}

function decodeCanonicalTcapBalanceSnapshotV1(payload: Uint8Array): TcapBalanceSnapshotV1 {
  let prefixOffset = 0;
  if (payload.length < 4) fail("snapshot_encoding_truncated");
  const prefixLength = new DataView(payload.slice(0, 4).buffer).getUint32(0, false);
  prefixOffset += 4;
  if (prefixOffset + prefixLength > payload.length) fail("snapshot_encoding_truncated");
  const new_commitment = hexFromBytes(payload.slice(prefixOffset, prefixOffset + prefixLength));
  prefixOffset += prefixLength;
  const bytes = payload.slice(prefixOffset);
  let offset = 0;
  const take = (length: number): Uint8Array => {
    if (offset + length > bytes.length) fail("snapshot_encoding_truncated");
    const value = bytes.slice(offset, offset + length);
    offset += length;
    return value;
  };
  const readU32 = (): number => new DataView(take(4).buffer).getUint32(0, false);
  const readU64 = (): bigint => new DataView(take(8).buffer).getBigUint64(0, false);
  const readFrame = (): Uint8Array => take(readU32());
  const domain = new TextDecoder().decode(readFrame());
  if (domain !== SNAPSHOT_DOMAIN) fail("snapshot_domain_mismatch");
  const version = readU32();
  const sequence = readU64();
  const previous_commitment = hexFromBytes(take(32));
  const policy_commitment = hexFromBytes(take(32));
  const transition_nullifier = hexFromBytes(take(32));
  const tsn_settlement_commitment = hexFromBytes(take(32));
  const created_at = readU64();
  const encrypted_record_locator = new TextDecoder().decode(readFrame());
  const count = readU32();
  const token_balances: TcapTokenBalanceV1[] = [];
  for (let index = 0; index < count; index += 1) {
    token_balances.push({
      token_id: readU32(),
      native_amount: readU64(),
      stable_units: readU64(),
      stable_rate_version: readU32(),
    });
  }
  if (offset !== bytes.length) fail("snapshot_encoding_trailing_bytes");
  return {
    version: version as typeof TCAP_BALANCE_SNAPSHOT_VERSION_V1,
    sequence,
    previous_commitment,
    new_commitment,
    token_balances,
    policy_commitment,
    transition_nullifier,
    tsn_settlement_commitment,
    created_at,
    encrypted_record_locator,
  };
}

export async function readPrivateTcapBalance(params: Readonly<{
  fetchTip: () => Promise<TcapTipStateV1>;
  store: TcapSnapshotStore;
  key: CryptoKey;
  decode?: TcapSnapshotDecoder;
  includeHistory?: boolean;
}>): Promise<Readonly<{ snapshot: TcapBalanceSnapshotV1; history: readonly TcapBalanceSnapshotV1[] }>> {
  const tip = await params.fetchTip();
  const commitment = normalizeCommitment(tip.current_commitment, "tip_commitment");
  const envelope = await params.store.load(commitment);
  if (!envelope) fail("private_snapshot_not_found");
  const snapshot = await decryptAndVerifyTcapBalanceSnapshotV1(envelope, params.key, params.decode ?? decodeCanonicalTcapBalanceSnapshotV1);
  assertSnapshotMatchesTip(snapshot, tip);
  const history: TcapBalanceSnapshotV1[] = [];
  if (params.includeHistory) {
    let previous = snapshot.previous_commitment;
    while (previous !== ZERO_COMMITMENT) {
      const priorEnvelope = await params.store.load(previous as Hex32);
      if (!priorEnvelope) fail("private_snapshot_history_gap");
      const prior = await decryptAndVerifyTcapBalanceSnapshotV1(priorEnvelope, params.key, params.decode);
      if (prior.new_commitment !== previous) fail("private_snapshot_history_link_mismatch");
      history.push(prior);
      previous = prior.previous_commitment;
    }
  }
  return { snapshot, history };
}

/** Runtime guard for stores: encrypted envelopes must never contain plaintext balances. */
export function assertEncryptedSnapshotOpaque(value: unknown): asserts value is EncryptedTCapBalanceSnapshotV1 {
  if (!value || typeof value !== "object" || "token_balances" in value) fail("plaintext_snapshot_exposed");
  const envelope = value as Partial<EncryptedTCapBalanceSnapshotV1>;
  if (!(envelope.ciphertext instanceof Uint8Array) || !(envelope.nonce instanceof Uint8Array)) {
    fail("invalid_encrypted_snapshot_envelope");
  }
}
