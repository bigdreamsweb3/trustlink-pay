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

export type GpruHiddenHeadProofV1 = {
  publicInputs: readonly string[];
  proofA: string;
  proofB: string;
  proofC: string;
  actionKind: number;
  tokenId: number;
  amount: string | bigint;
  authorizationCommitment: string;
};

function fixedHex(value: string, byteLength: number, label: string): Buffer {
  if (!new RegExp(`^[0-9a-f]{${byteLength * 2}}$`, "i").test(value)) {
    throw new Error(`${label} must be ${byteLength}-byte hex`);
  }
  return Buffer.from(value, "hex");
}

function serializeHiddenHeadProof(proof: GpruHiddenHeadProofV1): Buffer {
  if (proof.publicInputs.length !== 9) throw new Error("GPRU hidden-head V1 requires exactly 9 public inputs");
  if (![1, 2, 3].includes(proof.actionKind)) throw new Error("Unsupported GPRU hidden-head action kind");
  const action = Buffer.from([proof.actionKind]);
  return Buffer.concat([
    ...proof.publicInputs.map((value, index) => fixedHex(value, 32, `proof.publicInputs[${index}]`)),
    fixedHex(proof.proofA, 64, "proof.proofA"),
    fixedHex(proof.proofB, 128, "proof.proofB"),
    fixedHex(proof.proofC, 64, "proof.proofC"),
    action,
    u32(proof.tokenId),
    u64(proof.amount),
    fixedHex(proof.authorizationCommitment, 32, "proof.authorizationCommitment"),
  ]);
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
  // TcapAssetEntryV1 stores tokenId at 44, decimals at 244, and its active,
  // risk, pause, and deposit flags immediately after decimals. Resolve these
  // values from TCAP so newly approved assets need no SDK hard-coded list.
  const tokenId = data.readUInt32LE(44);
  const decimals = data[244]!;
  if (tokenId === 0 || decimals > 18 || data[245] !== 1 || data[247] !== 0
      || data[283] !== 1 || data[284] !== 1 || data[285] !== 0) {
    throw new Error("TCAP_ASSET_NOT_ACTIVE_FOR_DEPOSITS");
  }
  const reserveState = new PublicKey(data.subarray(148, 180));
  const vault = new PublicKey(data.subarray(180, 212));
  const reserveAuthority = new PublicKey(data.subarray(212, 244));
  if (reserveState.equals(PublicKey.default) || vault.equals(PublicKey.default) || reserveAuthority.equals(PublicKey.default)) {
    throw new Error("TCAP_ASSET_ENTRY_RESERVE_NOT_CONFIGURED");
  }
  const source = getAssociatedTokenAddressSync(fields.mint, fields.depositor, false, fields.tokenProgram);
  return { depositor: fields.depositor, tcapProgramId: programId, config, registry, assetEntry, assetEntryAccount: entryAccount, reserveState, reserveAuthority, source, vault, mint: fields.mint, tokenProgram: fields.tokenProgram, tokenId, decimals };
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

/** Mother-authorized memo credit, fenced by TCAP's shared settlement root. */
export function buildTsnRegisterTcapCreditAuthorizationV2Instruction(fields: {
  authority: PublicKey; motherEscrow: PublicKey; tcapProgramId?: PublicKey; commitmentRoot: PublicKey;
  assetEntry: PublicKey; reserveState: PublicKey; config: PublicKey; tipRouteRoot: PublicKey;
  gpruVerifier: PublicKey; instructions?: PublicKey; gpruProgramId?: PublicKey;
  authorizationDigest: string; validAfterSlot: string | bigint; expiresAtSlot: string | bigint;
  previousTcapRoot: string; tcapRootSequence: string | bigint; tokenId: number;
  amountBaseUnits: string | bigint; nullifier: string; proof: GpruHiddenHeadProofV1;
}) {
  const auth = bytes32(fields.authorizationDigest, "authorizationDigest");
  const [signer] = PublicKey.findProgramAddressSync([Buffer.from("tsn:tcap-authorization:v1"), auth], TSN_ID);
  const data = Buffer.concat([
    discriminator("tsn_register_tcap_credit_authorization_v2"), auth,
    u64(fields.validAfterSlot), u64(fields.expiresAtSlot),
    bytes32(fields.previousTcapRoot, "previousTcapRoot"), u64(fields.tcapRootSequence),
    u32(fields.tokenId), u64(fields.amountBaseUnits), bytes32(fields.nullifier, "nullifier"),
    serializeHiddenHeadProof(fields.proof),
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
    { pubkey: fields.commitmentRoot, isSigner: false, isWritable: true },
    { pubkey: fields.reserveState, isSigner: false, isWritable: true },
    { pubkey: signer, isSigner: false, isWritable: false },
    { pubkey: fields.tipRouteRoot, isSigner: false, isWritable: false },
    { pubkey: fields.gpruVerifier, isSigner: false, isWritable: false },
    { pubkey: fields.instructions ?? SYSVAR_INSTRUCTIONS_PUBKEY, isSigner: false, isWritable: false },
    { pubkey: fields.gpruProgramId ?? GPRU_PROGRAM_ID, isSigner: false, isWritable: false },
  ], data });
}

