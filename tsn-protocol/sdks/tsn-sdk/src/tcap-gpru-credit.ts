import { Connection, PublicKey, SYSVAR_INSTRUCTIONS_PUBKEY, SystemProgram, Transaction, TransactionInstruction } from "@solana/web3.js";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import { sha256 } from "@noble/hashes/sha2";
import { utf8ToBytes } from "@noble/hashes/utils";
import { Buffer } from "buffer";
import { buildTcapDepositAssetV2Instruction } from "./tcap-one-time-credit.js";

export const GPRU_TCAP_PROGRAM_ID = new PublicKey("tCaP5R8LZFL1ridm3JCAtiqFzNnZCQYj3Hb7kw42YZF");
const TCAP_ID = GPRU_TCAP_PROGRAM_ID;
const TSN_ID = new PublicKey("TSN31jddtsmUg4D5aEdhY31nwB1e53VJJg9X8NoRP8V");
export const GPRU_PROGRAM_ID = new PublicKey("6XsdcNRG7SkSceLduXmEvbrpCqgHfM6oj12Qx49o1hVR");
const digest = (...parts: Uint8Array[]) => Buffer.from(sha256(Buffer.concat(parts.map((part) => Buffer.from(part)))));
const bytes32 = (value: string, label: string) => {
  if (!/^[0-9a-f]{64}$/i.test(value)) throw new Error(`${label} must be 32-byte hex`);
  return Buffer.from(value, "hex");
};
const u32 = (value: number) => { const b = Buffer.alloc(4); b.writeUInt32LE(value); return b; };
const u64 = (value: string | bigint) => { const b = Buffer.alloc(8); b.writeBigUInt64LE(BigInt(value)); return b; };
const discriminator = (name: string) => digest(utf8ToBytes(`global:${name}`)).subarray(0, 8);

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

/** Builds only the sender-signed reserve deposit. TIP settlement is Node-owned. */
export function buildTcapGpruWalletDepositTransaction(fields: {
  accounts: Awaited<ReturnType<typeof resolveTcapGpruDepositAccounts>>;
  amountBaseUnits: bigint;
}) {
  const transaction = new Transaction();
  transaction.add(buildTcapDepositAssetV2Instruction({
    ...fields.accounts,
    programId: fields.accounts.tcapProgramId,
    amount: fields.amountBaseUnits,
  }));
  transaction.feePayer = fields.accounts.depositor;
  return transaction;
}

export { Transaction as TcapGpruTransaction };

/** Exact Mother-authorized TSN CPI wrapper for TCAP credit_tcap_tin_tip_v2. */
export function buildTsnRegisterTcapCreditAuthorizationV2Instruction(fields: {
  authority: PublicKey; motherEscrow: PublicKey; tcapProgramId?: PublicKey; tipRootCommitment: string; tip: PublicKey;
  assetEntry: PublicKey; config: PublicKey; authorizationDigest: string; validAfterSlot: string | bigint;
  expiresAtSlot: string | bigint; previousCommitment: string; newCommitment: string;
  sequence: string | bigint; tokenId: number; policyCommitment: string;
  gpruScopeCommitment: string; nullifier: string; tipRegistry: PublicKey;
  dnaKeyCommitment: string; dna: string; ephemeralPublicKey: string; oneTimePublicKey: string;
  derivationProof: { sharedPoint: string; generatorCommitment: string; scanCommitment: string; response: string };
  amountBaseUnits: string | bigint;
  previousBalanceCiphertext: string;
  balanceCiphertext: string;
  initialBalanceCiphertext: string;
  initialBalanceProof: { generatorCommitment: string; keyCommitment: string; response: string };
}) {
  const auth = bytes32(fields.authorizationDigest, "authorizationDigest");
  const [signer] = PublicKey.findProgramAddressSync([Buffer.from("tsn:tcap-authorization:v1"), auth], TSN_ID);
  const data = Buffer.concat([
    discriminator("tsn_register_tcap_credit_authorization_v2"), auth,
    u64(fields.validAfterSlot), u64(fields.expiresAtSlot),
    bytes32(fields.previousCommitment, "previousCommitment"), bytes32(fields.newCommitment, "newCommitment"),
    u64(fields.sequence), u32(fields.tokenId), bytes32(fields.policyCommitment, "policyCommitment"),
    bytes32(fields.gpruScopeCommitment, "gpruScopeCommitment"), bytes32(fields.nullifier, "nullifier"),
    bytes32(fields.dnaKeyCommitment, "dnaKeyCommitment"), bytes32(fields.dna, "dna"),
    bytes32(fields.ephemeralPublicKey, "ephemeralPublicKey"), bytes32(fields.oneTimePublicKey, "oneTimePublicKey"),
    bytes32(fields.derivationProof.sharedPoint, "derivationProof.sharedPoint"),
    bytes32(fields.derivationProof.generatorCommitment, "derivationProof.generatorCommitment"),
    bytes32(fields.derivationProof.scanCommitment, "derivationProof.scanCommitment"),
    bytes32(fields.derivationProof.response, "derivationProof.response"),
    u64(fields.amountBaseUnits),
    (() => {
      if (!/^[0-9a-f]{128}$/i.test(fields.previousBalanceCiphertext)) throw new Error("previousBalanceCiphertext must be 64-byte hex");
      return Buffer.from(fields.previousBalanceCiphertext, "hex");
    })(),
    (() => {
      if (!/^[0-9a-f]{128}$/i.test(fields.balanceCiphertext)) throw new Error("balanceCiphertext must be 64-byte hex");
      return Buffer.from(fields.balanceCiphertext, "hex");
    })(),
    (() => {
      if (!/^[0-9a-f]{128}$/i.test(fields.initialBalanceCiphertext)) throw new Error("initialBalanceCiphertext must be 64-byte hex");
      return Buffer.from(fields.initialBalanceCiphertext, "hex");
    })(),
    bytes32(fields.initialBalanceProof.generatorCommitment, "initialBalanceProof.generatorCommitment"),
    bytes32(fields.initialBalanceProof.keyCommitment, "initialBalanceProof.keyCommitment"),
    bytes32(fields.initialBalanceProof.response, "initialBalanceProof.response"),
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
    { pubkey: GPRU_PROGRAM_ID, isSigner: false, isWritable: false },
    { pubkey: fields.tipRegistry, isSigner: false, isWritable: false },
    { pubkey: SYSVAR_INSTRUCTIONS_PUBKEY, isSigner: false, isWritable: false },
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
  ], data });
}

