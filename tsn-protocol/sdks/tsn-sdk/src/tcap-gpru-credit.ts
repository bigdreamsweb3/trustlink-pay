import { Connection, PublicKey, SystemProgram, Transaction, TransactionInstruction } from "@solana/web3.js";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import { sha256 } from "@noble/hashes/sha2";
import { utf8ToBytes } from "@noble/hashes/utils";
import { Buffer } from "buffer";
import { deriveTinPrivacyReceivingKeyCommitment, encryptGpruCreditNote } from "./gpru.js";
import { buildTcapDepositAssetV2Instruction } from "./tcap-one-time-credit.js";

export const TCAP_GPRU_CREDIT_DOMAIN = "TSN_GPRU_TCAP_CREDIT_V2";
export const TCAP_GPRU_SCOPE_DOMAIN = "TSN_TIN_GPRU_CREDIT_SCOPE_V1";
export const TCAP_GPRU_COMMITMENT_DOMAIN = "TSN_TIN_GPRU_CREDIT_COMMITMENT_V1";
export const GPRU_TCAP_PROGRAM_ID = new PublicKey("tCaP5R8LZFL1ridm3JCAtiqFzNnZCQYj3Hb7kw42YZF");
const TCAP_ID = GPRU_TCAP_PROGRAM_ID;
const TSN_ID = new PublicKey("TSN31jddtsmUg4D5aEdhY31nwB1e53VJJg9X8NoRP8V");
const digest = (...parts: Uint8Array[]) => Buffer.from(sha256(Buffer.concat(parts.map((part) => Buffer.from(part)))));
const bytes32 = (value: string, label: string) => {
  if (!/^[0-9a-f]{64}$/i.test(value)) throw new Error(`${label} must be 32-byte hex`);
  return Buffer.from(value, "hex");
};
const u32 = (value: number) => { const b = Buffer.alloc(4); b.writeUInt32LE(value); return b; };
const u64 = (value: string | bigint) => { const b = Buffer.alloc(8); b.writeBigUInt64LE(BigInt(value)); return b; };
const discriminator = (name: string) => digest(utf8ToBytes(`global:${name}`)).subarray(0, 8);

export function deriveTinCreditTip(tipRootCommitment: string, tcapProgramId: PublicKey = GPRU_TCAP_PROGRAM_ID) {
  return PublicKey.findProgramAddressSync([
    Buffer.from("tcap:tin-tip:v1"), bytes32(tipRootCommitment, "tipRootCommitment"),
  ], tcapProgramId)[0];
}

/** Reads the canonical reserve and vault from TCAP's on-chain asset entry.
 * The reserve is never derived from an assetState PDA. */
export async function resolveTcapGpruDepositAccounts(connection: Connection, fields: {
  depositor: PublicKey; mint: PublicKey; tokenProgram: PublicKey; tcapProgramId: PublicKey;
}) {
  const programId = fields.tcapProgramId;
  const [config] = PublicKey.findProgramAddressSync([Buffer.from("tcap:global-config:v1")], programId);
  const [registry] = PublicKey.findProgramAddressSync([Buffer.from("tcap:asset-registry:v1")], programId);
  const [assetEntry] = PublicKey.findProgramAddressSync([
    Buffer.from("tcap:asset-entry:v1"), registry.toBuffer(), fields.tokenProgram.toBuffer(), fields.mint.toBuffer(),
  ], programId);
  const entryAccount = await connection.getAccountInfo(assetEntry, "confirmed");
  if (!entryAccount) throw new Error("MINT_NOT_REGISTERED_IN_TCAP");
  if (!entryAccount.owner.equals(programId)) throw new Error("TCAP_ASSET_ENTRY_OWNER_MISMATCH");
  const data = entryAccount.data;
  const expectedDiscriminator = digest(Buffer.from("account:TcapAssetEntryV1")).subarray(0, 8);
  if (data.length < 287 || !data.subarray(0, 8).equals(expectedDiscriminator)) {
    throw new Error("TCAP_ASSET_ENTRY_LAYOUT_INVALID");
  }
  if (!data.subarray(12, 44).equals(registry.toBuffer())
      || !data.subarray(48, 80).equals(fields.tokenProgram.toBuffer())
      || !data.subarray(80, 112).equals(fields.mint.toBuffer())) {
    throw new Error("TCAP_ASSET_ENTRY_BINDING_MISMATCH");
  }
  const reserveState = new PublicKey(data.subarray(148, 180));
  const vault = new PublicKey(data.subarray(180, 212));
  const reserveAuthority = new PublicKey(data.subarray(212, 244));
  if (reserveState.equals(PublicKey.default) || vault.equals(PublicKey.default) || reserveAuthority.equals(PublicKey.default)) {
    throw new Error("TCAP_ASSET_ENTRY_RESERVE_NOT_CONFIGURED");
  }
  const source = getAssociatedTokenAddressSync(fields.mint, fields.depositor, false, fields.tokenProgram);
  return { depositor: fields.depositor, tcapProgramId: programId, config, registry, assetEntry, assetEntryAccount: entryAccount, reserveState, reserveAuthority, source, vault, mint: fields.mint, tokenProgram: fields.tokenProgram };
}

/** Builds the sender-signed reserve deposit, adding TIP initialization only for a first credit. */
export function buildTcapGpruWalletDepositTransaction(fields: {
  accounts: Awaited<ReturnType<typeof resolveTcapGpruDepositAccounts>>;
  amountBaseUnits: bigint;
  tipRootCommitment: string;
  previousCommitment: string;
  policyCommitment: string;
  initializeTip: boolean;
}) {
  const transaction = new Transaction();
  if (fields.initializeTip) {
    const init = buildInitializeTcapTinTipV1Instruction({
      payer: fields.accounts.depositor,
      tcapProgramId: fields.accounts.tcapProgramId,
      tipRootCommitment: fields.tipRootCommitment,
      currentCommitment: fields.previousCommitment,
      policyCommitment: fields.policyCommitment,
    });
    transaction.add(init);
  }
  transaction.add(buildTcapDepositAssetV2Instruction({
    ...fields.accounts,
    programId: fields.accounts.tcapProgramId,
    amount: fields.amountBaseUnits,
  }));
  transaction.feePayer = fields.accounts.depositor;
  return transaction;
}

export { Transaction as TcapGpruTransaction };

/** Initializes the recipient's long-lived GPRU tip on the first incoming credit. */
export function buildInitializeTcapTinTipV1Instruction(fields: {
  payer: PublicKey; tcapProgramId?: PublicKey; tipRootCommitment: string; currentCommitment: string; policyCommitment: string;
}) {
  const tcapProgramId = fields.tcapProgramId ?? GPRU_TCAP_PROGRAM_ID;
  const tip = deriveTinCreditTip(fields.tipRootCommitment, tcapProgramId);
  const data = Buffer.concat([
    discriminator("initialize_tcap_tin_tip_v1"),
    bytes32(fields.tipRootCommitment, "tipRootCommitment"),
    bytes32(fields.currentCommitment, "initialCurrentCommitment"),
    bytes32(fields.policyCommitment, "policyCommitment"),
  ]);
  return new TransactionInstruction({ programId: tcapProgramId, keys: [
    { pubkey: fields.payer, isSigner: true, isWritable: true },
    { pubkey: tip, isSigner: false, isWritable: true },
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
  ], data });
}

export function deriveTcapCreditAuthorizationDigest(fields: {
  tip: PublicKey; validAfterSlot: string | bigint; expiresAtSlot: string | bigint;
  previousCommitment: string; newCommitment: string; sequence: string | bigint;
  tokenId: number; policyCommitment: string; gpruScopeCommitment: string; nullifier: string;
}) {
  if (!Number.isSafeInteger(fields.tokenId) || fields.tokenId < 1 || fields.tokenId > 0xffff_ffff) throw new Error("TCAP_TOKEN_ID_OUT_OF_RANGE");
  return digest(
    Buffer.from(TCAP_GPRU_CREDIT_DOMAIN), fields.tip.toBuffer(), u64(fields.validAfterSlot), u64(fields.expiresAtSlot),
    bytes32(fields.previousCommitment, "previousCommitment"), bytes32(fields.newCommitment, "newCommitment"),
    u64(fields.sequence), u32(fields.tokenId), bytes32(fields.policyCommitment, "policyCommitment"),
    bytes32(fields.gpruScopeCommitment, "gpruScopeCommitment"), bytes32(fields.nullifier, "nullifier"),
  ).toString("hex");
}

export function deriveGpruCreditCommitment(fields: {
  tipRootCommitment: string; previousCommitment: string; sequence: string | bigint; tokenId: number;
  policyCommitment: string; envelope: Uint8Array; nonce: Uint8Array;
}) {
  if (fields.envelope.length !== 164 || fields.nonce.length !== 24) throw new Error("INVALID_GPRU_CREDIT_ENVELOPE");
  return digest(
    Buffer.from(TCAP_GPRU_COMMITMENT_DOMAIN), bytes32(fields.tipRootCommitment, "tipRootCommitment"),
    bytes32(fields.previousCommitment, "previousCommitment"), u64(fields.sequence), u32(fields.tokenId),
    bytes32(fields.policyCommitment, "policyCommitment"), digest(fields.envelope), fields.nonce,
  ).toString("hex");
}

export function deriveGpruCreditScope(fields: {
  tipRootCommitment: string; previousCommitment: string; newCommitment: string; sequence: string | bigint;
  tokenId: number; policyCommitment: string; nullifier: string;
}) {
  // This is an authorization-scope hash, not the GPRU receiving commitment or
  // the TCAP TIP PDA seed. It binds one encrypted successor to its TIN TIP,
  // predecessor, sequence, asset, policy, and nullifier. `newCommitment`
  // includes the encrypted note digest, so the amount is bound without being
  // exposed in this scope value.
  return digest(
    Buffer.from(TCAP_GPRU_SCOPE_DOMAIN), bytes32(fields.tipRootCommitment, "tipRootCommitment"),
    bytes32(fields.previousCommitment, "previousCommitment"), bytes32(fields.newCommitment, "newCommitment"),
    u64(fields.sequence), u32(fields.tokenId), bytes32(fields.policyCommitment, "policyCommitment"),
    bytes32(fields.nullifier, "nullifier"),
  ).toString("hex");
}

/** Creates the opaque public transition and recipient-only encrypted credit note. */
export function createGpruTinCredit(params: {
  tcapProgramId?: PublicKey;
  tipRootCommitment: string; gpruCommitment: Uint8Array; previousCommitment: string;
  sequence: bigint; tokenId: number; amountBaseUnits: bigint; policyCommitment: string;
  validAfterSlot: bigint; expiresAtSlot: bigint;
  nullifier?: Uint8Array;
}) {
  const nullifier = params.nullifier ?? crypto.getRandomValues(new Uint8Array(32));
  if (nullifier.length !== 32 || nullifier.every((byte) => byte === 0)) throw new Error("INVALID_GPRU_CREDIT_NULLIFIER");
  const encrypted = encryptGpruCreditNote(params.gpruCommitment, {
    amountBaseUnits: params.amountBaseUnits, tokenId: params.tokenId, sequence: params.sequence,
    previousCommitment: Buffer.from(params.previousCommitment, "hex"),
    policyCommitment: Buffer.from(params.policyCommitment, "hex"),
  }, {
    tipRootCommitment: Buffer.from(params.tipRootCommitment, "hex"),
    previousCommitment: Buffer.from(params.previousCommitment, "hex"),
    policyCommitment: Buffer.from(params.policyCommitment, "hex"),
    sequence: params.sequence,
    tokenId: params.tokenId,
  });
  // Bind the opaque on-chain successor to the exact recipient-encrypted note.
  // The note contents remain private; Node can validate this commitment before
  // asking TSN to advance the public TIP.
  const newCommitment = deriveGpruCreditCommitment({
    tipRootCommitment: params.tipRootCommitment,
    previousCommitment: params.previousCommitment,
    sequence: params.sequence,
    tokenId: params.tokenId,
    policyCommitment: params.policyCommitment,
    envelope: encrypted.envelope,
    nonce: encrypted.nonce,
  });
  const nullifierHex = Buffer.from(nullifier).toString("hex");
  const gpruScopeCommitment = deriveGpruCreditScope({
    tipRootCommitment: params.tipRootCommitment, previousCommitment: params.previousCommitment,
    newCommitment, sequence: params.sequence, tokenId: params.tokenId,
    policyCommitment: params.policyCommitment, nullifier: nullifierHex,
  });
  const tip = deriveTinCreditTip(params.tipRootCommitment, params.tcapProgramId ?? GPRU_TCAP_PROGRAM_ID);
  const authorizationDigest = deriveTcapCreditAuthorizationDigest({
    tip, validAfterSlot: params.validAfterSlot, expiresAtSlot: params.expiresAtSlot,
    previousCommitment: params.previousCommitment, newCommitment, sequence: params.sequence,
    tokenId: params.tokenId, policyCommitment: params.policyCommitment,
    gpruScopeCommitment, nullifier: nullifierHex,
  });
  return {
    previousCommitment: params.previousCommitment.toLowerCase(), newCommitment,
    sequence: params.sequence.toString(), tokenId: params.tokenId,
    policyCommitment: params.policyCommitment.toLowerCase(), gpruScopeCommitment,
    nullifier: nullifierHex,
    validAfterSlot: params.validAfterSlot.toString(), expiresAtSlot: params.expiresAtSlot.toString(),
    authorizationDigest,
    recipientPrivacyKeyCommitment: Buffer.from(deriveTinPrivacyReceivingKeyCommitment(params.gpruCommitment)).toString("hex"),
    gpruCreditEnvelopeBase64: Buffer.from(encrypted.envelope).toString("base64"),
    gpruCreditNonceBase64: Buffer.from(encrypted.nonce).toString("base64"),
  };
}

/** Exact Mother-authorized TSN CPI wrapper for TCAP credit_tcap_tin_tip_v2. */
export function buildTsnRegisterTcapCreditAuthorizationV2Instruction(fields: {
  authority: PublicKey; motherEscrow: PublicKey; tcapProgramId?: PublicKey; tipRootCommitment: string; tip: PublicKey;
  assetEntry: PublicKey; config: PublicKey; authorizationDigest: string; validAfterSlot: string | bigint;
  expiresAtSlot: string | bigint; previousCommitment: string; newCommitment: string;
  sequence: string | bigint; tokenId: number; policyCommitment: string;
  gpruScopeCommitment: string; nullifier: string;
}) {
  const auth = bytes32(fields.authorizationDigest, "authorizationDigest");
  const [signer] = PublicKey.findProgramAddressSync([Buffer.from("tsn:tcap-authorization:v1"), auth], TSN_ID);
  const data = Buffer.concat([
    discriminator("tsn_register_tcap_credit_authorization_v2"), auth,
    u64(fields.validAfterSlot), u64(fields.expiresAtSlot),
    bytes32(fields.previousCommitment, "previousCommitment"), bytes32(fields.newCommitment, "newCommitment"),
    u64(fields.sequence), u32(fields.tokenId), bytes32(fields.policyCommitment, "policyCommitment"),
    bytes32(fields.gpruScopeCommitment, "gpruScopeCommitment"), bytes32(fields.nullifier, "nullifier"),
  ]);
  const tcapProgramId = fields.tcapProgramId ?? TCAP_ID;
  const [canonicalConfig] = PublicKey.findProgramAddressSync([Buffer.from("tcap:global-config:v1")], tcapProgramId);
  if (!canonicalConfig.equals(fields.config)) throw new Error("TCAP_CONFIG_NOT_CANONICAL");
  return new TransactionInstruction({ programId: TSN_ID, keys: [
    { pubkey: fields.authority, isSigner: true, isWritable: true },
    { pubkey: fields.motherEscrow, isSigner: false, isWritable: false },
    { pubkey: tcapProgramId, isSigner: false, isWritable: false },
    { pubkey: TSN_ID, isSigner: false, isWritable: false },
    { pubkey: fields.config, isSigner: false, isWritable: false },
    { pubkey: fields.assetEntry, isSigner: false, isWritable: false },
    { pubkey: new PublicKey(bytes32(fields.tipRootCommitment, "tipRootCommitment")), isSigner: false, isWritable: false },
    { pubkey: fields.tip, isSigner: false, isWritable: true },
    { pubkey: signer, isSigner: false, isWritable: false },
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
  ], data });
}
