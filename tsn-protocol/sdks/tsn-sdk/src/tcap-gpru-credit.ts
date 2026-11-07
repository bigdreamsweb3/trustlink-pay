import { Connection, PublicKey, SYSVAR_INSTRUCTIONS_PUBKEY, SystemProgram, Transaction, TransactionInstruction } from "@solana/web3.js";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import { sha256 } from "@noble/hashes/sha2";
import { utf8ToBytes } from "@noble/hashes/utils";
import { Buffer } from "buffer";
import { canonicalFundingFieldHex } from "./gpru/funding-note.js";

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

export type GpruHiddenHeadProofV2 = {
  publicInputs: readonly string[];
  proofA: string;
  proofB: string;
  proofC: string;
  actionKind: number;
  tokenId: number;
  amountCommitment: string;
  authorizationCommitment: string;
};

function fixedHex(value: string, byteLength: number, label: string): Buffer {
  if (!new RegExp(`^[0-9a-f]{${byteLength * 2}}$`, "i").test(value)) {
    throw new Error(`${label} must be ${byteLength}-byte hex`);
  }
  return Buffer.from(value, "hex");
}

function serializeHiddenHeadProof(proof: GpruHiddenHeadProofV2): Buffer {
  if (proof.publicInputs.length !== 13) throw new Error("GPRU funded-note credit requires exactly 13 public inputs");
  if (![1, 2, 3].includes(proof.actionKind)) throw new Error("Unsupported GPRU hidden-head action kind");
  const action = Buffer.from([proof.actionKind]);
  return Buffer.concat([
    ...proof.publicInputs.map((value, index) => fixedHex(value, 32, `proof.publicInputs[${index}]`)),
    fixedHex(proof.proofA, 64, "proof.proofA"),
    fixedHex(proof.proofB, 128, "proof.proofB"),
    fixedHex(proof.proofC, 64, "proof.proofC"),
    action,
    u32(proof.tokenId),
    bytes32(canonicalFundingFieldHex(proof.amountCommitment,"Proof amount commitment"),"Proof amount commitment"),
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
  const [fundingRootAccount] = PublicKey.findProgramAddressSync([Buffer.from("tcap:funding-root:v1")], programId);
  return { depositor: fields.depositor, tcapProgramId: programId, config, registry, assetEntry, assetEntryAccount: entryAccount, reserveState, reserveAuthority, source, vault, mint: fields.mint, tokenProgram: fields.tokenProgram, fundingRootAccount, tokenId, decimals };
}

/** Builds only the sender-signed reserve deposit. TIP settlement is Node-owned. */
export function buildTcapGpruWalletDepositTransaction(fields: {
  accounts: Awaited<ReturnType<typeof resolveTcapGpruDepositAccounts>>;
  amountBaseUnits: bigint;
  fundingNoteCommitment: string;
}) {
  if (fields.amountBaseUnits <= 0n || fields.amountBaseUnits > 0xffff_ffff_ffff_ffffn) throw new Error("TCAP_DEPOSIT_AMOUNT_MUST_BE_POSITIVE_U64");
  const commitment = canonicalFundingFieldHex(fields.fundingNoteCommitment, "Funding note commitment");
  const [root] = PublicKey.findProgramAddressSync([Buffer.from("tcap:funding-root:v1")], fields.accounts.tcapProgramId);
  if (!root.equals(fields.accounts.fundingRootAccount)) throw new Error("TCAP_FUNDING_ROOT_NOT_CANONICAL");
  const transaction = new Transaction();
  transaction.add(new TransactionInstruction({ programId: fields.accounts.tcapProgramId,
    keys: [
      { pubkey: fields.accounts.depositor, isSigner: true, isWritable: true },
      { pubkey: fields.accounts.config, isSigner: false, isWritable: false },
      { pubkey: fields.accounts.assetEntry, isSigner: false, isWritable: false },
      { pubkey: fields.accounts.reserveState, isSigner: false, isWritable: true },
      { pubkey: fields.accounts.source, isSigner: false, isWritable: true },
      { pubkey: fields.accounts.vault, isSigner: false, isWritable: true },
      { pubkey: fields.accounts.mint, isSigner: false, isWritable: false },
      { pubkey: fields.accounts.tokenProgram, isSigner: false, isWritable: false },
      { pubkey: root, isSigner: false, isWritable: true },
    ], data: Buffer.concat([discriminator("deposit_private_funding_v1"), u64(fields.amountBaseUnits), bytes32(commitment, "Funding note commitment")]) }));
  transaction.feePayer = fields.accounts.depositor;
  return transaction;
}

export { Transaction as TcapGpruTransaction };

/** Mother-authorized memo credit, fenced by TCAP's shared settlement root. */
export function buildTsnRegisterTcapCreditAuthorizationV3Instruction(fields: {
  authority: PublicKey; motherEscrow: PublicKey; tcapProgramId?: PublicKey; commitmentRoot: PublicKey;
  assetEntry: PublicKey; reserveState: PublicKey; config: PublicKey; tipRouteRoot: PublicKey;
  fundingRootAccount: PublicKey; accountingEpoch: PublicKey;
  gpruVerifier: PublicKey; instructions?: PublicKey; gpruProgramId?: PublicKey;
  authorizationDigest: string; validAfterSlot: string | bigint; expiresAtSlot: string | bigint;
  previousTcapRoot: string; tcapRootSequence: string | bigint; tokenId: number;
  amountCommitment: string; nullifier: string; proof: GpruHiddenHeadProofV2;
}) {
  if(fields.amountCommitment !== fields.proof.amountCommitment || fields.tokenId !== fields.proof.tokenId || fields.proof.actionKind !== 1)throw new Error("PRIVATE_CREDIT_PROOF_ACTION_MISMATCH");
  const auth = bytes32(fields.authorizationDigest, "authorizationDigest");
  const [signer] = PublicKey.findProgramAddressSync([Buffer.from("tsn:tcap-authorization:v1"), auth], TSN_ID);
  const data = Buffer.concat([
    discriminator("tsn_register_tcap_credit_authorization_v3"), auth,
    u64(fields.validAfterSlot), u64(fields.expiresAtSlot),
    bytes32(fields.previousTcapRoot, "previousTcapRoot"), u64(fields.tcapRootSequence),
    u32(fields.tokenId), bytes32(canonicalFundingFieldHex(fields.amountCommitment,"Credit amount commitment"),"Credit amount commitment"), bytes32(fields.nullifier, "nullifier"),
    serializeHiddenHeadProof(fields.proof),
  ]);
  const tcapProgramId = fields.tcapProgramId ?? TCAP_ID;
  const [fundingRoot] = PublicKey.findProgramAddressSync([Buffer.from("tcap:sealed-funding:v1"),fields.assetEntry.toBuffer(),bytes32(fields.proof.publicInputs[12],"Funding root")], tcapProgramId);
  if (!fundingRoot.equals(fields.fundingRootAccount)) throw new Error("TCAP_FUNDING_ROOT_NOT_CANONICAL");
  canonicalFundingFieldHex(fields.proof.publicInputs[12], "Funding root proof input");
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
    { pubkey: fields.reserveState, isSigner: false, isWritable: false },
    { pubkey: signer, isSigner: false, isWritable: false },
    { pubkey: fields.tipRouteRoot, isSigner: false, isWritable: false },
    { pubkey: fields.gpruVerifier, isSigner: false, isWritable: false },
    { pubkey: fields.instructions ?? SYSVAR_INSTRUCTIONS_PUBKEY, isSigner: false, isWritable: false },
    { pubkey: fields.gpruProgramId ?? GPRU_PROGRAM_ID, isSigner: false, isWritable: false },
    { pubkey: fundingRoot, isSigner: false, isWritable: false },
    { pubkey: fields.accountingEpoch, isSigner: false, isWritable: true },
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
  ], data });
}


export type GpruTcapEpochProofV1={publicInputs:readonly string[];proofA:string;proofB:string;proofC:string};
/** Aggregate accounting has no Memo and changes liabilities once for a complete verified epoch. */
export function buildTcapAccountCreditEpochV1Instruction(f:{authority:PublicKey;mother:PublicKey;config:PublicKey;assetEntry:PublicKey;reserveState:PublicKey;epoch:PublicKey;total:bigint;proof:GpruTcapEpochProofV1}):TransactionInstruction {
    if(f.total<=0n||f.total>0xffffffffffffffffn||f.proof.publicInputs.length!==5)throw new Error("INVALID_CREDIT_EPOCH_TOTAL_OR_PROOF");
    const [verifier]=PublicKey.findProgramAddressSync([Buffer.from("gpru:tcap-epoch-verifier:v1")],GPRU_PROGRAM_ID);
    return new TransactionInstruction({programId:TCAP_ID,keys:[
        {pubkey:f.authority,isSigner:true,isWritable:true},{pubkey:f.mother,isSigner:false,isWritable:false},
        {pubkey:f.config,isSigner:false,isWritable:false},{pubkey:f.assetEntry,isSigner:false,isWritable:false},
        {pubkey:f.reserveState,isSigner:false,isWritable:true},{pubkey:f.epoch,isSigner:false,isWritable:true},
        {pubkey:verifier,isSigner:false,isWritable:false},{pubkey:GPRU_PROGRAM_ID,isSigner:false,isWritable:false}],
        data:Buffer.concat([discriminator("account_credit_epoch_v1"),u64(f.total),...f.proof.publicInputs.map((v,i)=>bytes32(canonicalFundingFieldHex(v,"Epoch input",i===0),"Epoch input")),
            fixedHex(f.proof.proofA,64,"Epoch A"),fixedHex(f.proof.proofB,128,"Epoch B"),fixedHex(f.proof.proofC,64,"Epoch C")])});
}
/** Capture a chain-current funded root; later deposits cannot change this pool account. */
export function buildTcapSealFundingPoolV1Instruction(f:{authority:PublicKey;mother:PublicKey;config:PublicKey;assetEntry:PublicKey;root:string;eligibleNoteCount:bigint;sourceWalletCount:number;releaseSlot:bigint}):TransactionInstruction {
    if(f.eligibleNoteCount<2n||f.sourceWalletCount<2||!Number.isInteger(f.sourceWalletCount)||f.sourceWalletCount>65535||BigInt(f.sourceWalletCount)>f.eligibleNoteCount)throw new Error("FUNDING_POOL_REQUIRES_REAL_DISTINCT_SOURCES");
    const [fundingRoot]=PublicKey.findProgramAddressSync([Buffer.from("tcap:funding-root:v1")],TCAP_ID);
    const rootBytes=bytes32(canonicalFundingFieldHex(f.root,"Funding root"),"Funding root");
    const [pool]=PublicKey.findProgramAddressSync([Buffer.from("tcap:sealed-funding:v1"),f.assetEntry.toBuffer(),rootBytes],TCAP_ID);
    const sources=Buffer.alloc(2);sources.writeUInt16LE(f.sourceWalletCount);
    return new TransactionInstruction({programId:TCAP_ID,keys:[{pubkey:f.authority,isSigner:true,isWritable:true},
        {pubkey:f.mother,isSigner:false,isWritable:false},{pubkey:f.config,isSigner:false,isWritable:false},
        {pubkey:f.assetEntry,isSigner:false,isWritable:false},{pubkey:fundingRoot,isSigner:false,isWritable:false},
        {pubkey:pool,isSigner:false,isWritable:true},{pubkey:SystemProgram.programId,isSigner:false,isWritable:false}],
        data:Buffer.concat([discriminator("seal_private_funding_pool_v1"),rootBytes,u64(f.eligibleNoteCount),sources,u64(f.releaseSlot)])});
}
