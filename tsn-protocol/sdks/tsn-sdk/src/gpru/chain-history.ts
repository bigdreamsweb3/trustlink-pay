import { Connection, PublicKey, SYSVAR_INSTRUCTIONS_PUBKEY } from "@solana/web3.js";
import { Buffer } from "buffer";
import { sha256 } from "@noble/hashes/sha256";
import { bytesToHex } from "@noble/hashes/utils";
import { GPRU_PROGRAM_ID, GPRU_TCAP_PROGRAM_ID } from "../tcap-gpru-credit.js";
import { DEFAULT_TIP_PROGRAM_ID } from "../tins.js";
import { deriveGpruElgamalPublicKey } from "../gpru.js";
import { deriveGpruBalanceScanKeyV1 } from "./babyjub-delta-cipher.js";
import { decodeGpruHistoryTransactionV1, type GpruHistoryWireTransactionV1 } from "./native-credit-wire.js";
import { decryptGpruLedgerMemoV1, parseGpruMemoBindingV1, GpruMemoAuthenticationErrorV1, assertGpruMemoActionMatchesProofV1 } from "./transaction-record.js";
import { recoverGpruBalanceHistoryV1, type GpruDecryptedMemoActionV1 } from "./balance-history.js";
import type { GpruTinDebitOwnerOpeningV1 } from "./tin-debit-opening.js";
import { deriveGpruTinDebitBalancePointV1, decryptGpruTinDebitOwnerRecordV1, parseGpruTinDebitMemoBindingV1 } from "./tin-debit-record.js";
import { buildTsnRegisterTcapTinDebitAuthorizationV1Instruction, createGpruTinDebitMemoInstructionV1, deriveGpruTinDebitAccountsV1,
  type GpruTinDebitProofV1 } from "../tcap-gpru-tin-debit.js";

const TSNP = new PublicKey("TSN31jddtsmUg4D5aEdhY31nwB1e53VJJg9X8NoRP8V");
const MEMO = "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr";
const Q = 21888242871839275222246405745257275088548364400416034343698204186575808495617n;
// Poseidon(2), 128 empty levels for each map, then their composition.
// Matches TCAP authority::empty_gpru_hidden_head_root_v1 and the retained public capture.
const EMPTY_ROOT = "14935d601de8d6fbd04b084de8f8510dd25b5ed1d80ab5382b8f908dc0734b3a";
const hash = (bytes: Uint8Array) => bytesToHex(sha256(bytes));
const disc = (name: string) => hash(new TextEncoder().encode(name)).slice(0, 16);
const pda = (program: PublicKey, ...seeds: Uint8Array[]) => PublicKey.findProgramAddressSync(seeds, program)[0];
const seed = (name: string) => Buffer.from(name);
const ROOT = pda(GPRU_TCAP_PROGRAM_ID, seed("tcap:commitment-root:v1"));
const REGISTRY = pda(GPRU_TCAP_PROGRAM_ID, seed("tcap:asset-registry:v1"));
const FUNDING_ROOT = pda(GPRU_TCAP_PROGRAM_ID, seed("tcap:funding-root:v1"));
const field = (hex: string) => (BigInt(`0x${hex}`) % Q).toString(16).padStart(64, "0");
const fail = (reason: string): never => { throw new Error(`GPRU_BALANCE_HISTORY_UNAVAILABLE: ${reason}`); };
const check = (condition: unknown, reason: string): void => { if (!condition) fail(reason); };

export type GpruFinalizedCreditV1 = {
  signature: string;
  slot: number;
  sequence: bigint;
  oldRoot: string;
  newRoot: string;
  memoPayload: string;
  assetEntry: string;
  reserveState: string;
  fundingProofVersion: 1 | 2 | 3;
  accountingEpoch?: string;
  fundingRoot?: string;
  action: GpruDecryptedMemoActionV1["onChainAction"];
};

export type GpruFinalizedTinDebitV1 = {
  kind: "TIN_DEBIT"; signature: string; slot: number; sequence: bigint; oldRoot: string; newRoot: string;
  memoPayloads: [string, string]; assetEntry: string; reserveState: string; proof: GpruTinDebitProofV1;
  action: { actionKind: 4; tokenId: number; amountCommitment: string; actionCommitment: string; authorizationCommitment: string; nullifier: string };
};
export type GpruFinalizedTransitionV1 = GpruFinalizedCreditV1 | GpruFinalizedTinDebitV1;

/** Chain acceptance plus exact account, public digest and both compact Memo bindings. */
export function decodeFinalizedGpruTinDebitV1(wire: GpruHistoryWireTransactionV1, signature: string, slot: number): GpruFinalizedTinDebitV1 | null {
  check(wire.signatures[0] === signature, "receipt signature differs from transaction bytes");
  const transfers = wire.instructions.filter(ix => ix.programId === TSNP.toBase58() && bytesToHex(ix.data.subarray(0, 8)) === disc("global:tsn_register_tcap_tin_debit_authorization_v1"));
  if (transfers.length === 0) return null;
  check(transfers.length === 1 && wire.instructions.length === 3 && wire.instructions[0] === transfers[0], "unsupported transfer instruction order");
  const ix = transfers[0]!;
  check(ix.data.length === 1128 && ix.accounts.length === 13, "unsupported transfer ABI");
  const hex = (offset: number, size = 32) => bytesToHex(ix.data.subarray(offset, offset + size));
  const authorizationDigest = hex(8), publicInputs = Array.from({ length: 26 }, (_, index) => hex(40 + index * 32));
  const proof = { publicInputs, proofA: hex(872, 64), proofB: hex(936, 128), proofC: hex(1064, 64) };
  const accounts = deriveGpruTinDebitAccountsV1({ authority: new PublicKey(ix.accounts[0]), assetEntry: new PublicKey(ix.accounts[5]), authorizationDigest });
  const expected = buildTsnRegisterTcapTinDebitAuthorizationV1Instruction({ accounts, authorizationDigest, proof });
  check(expected.keys.every((key, index) => key.pubkey.toBase58() === ix.accounts[index]), "noncanonical transfer account");
  check(ix.signerAccounts.length === 1 && ix.signerAccounts[0] === ix.accounts[0]
    && ix.writableAccounts.length === 1 && ix.writableAccounts[0] === ix.accounts[6], "noncanonical transfer account privileges");
  check(BigInt(publicInputs[6]!.startsWith("0x") ? publicInputs[6]! : `0x${publicInputs[6]}`) <= BigInt(slot)
    && BigInt(slot) <= BigInt(`0x${publicInputs[7]}`), "transfer receipt lies outside its authorization interval");
  const memoPayloads = wire.instructions.slice(1).map((memo, leg) => {
    check(memo.programId === MEMO && memo.accounts.length === 1 && memo.accounts[0] === accounts.authority.toBase58()
      && memo.signerAccounts.length === 1 && memo.signerAccounts[0] === memo.accounts[0] && memo.writableAccounts.length === 0, "noncanonical transfer Memo signer or privileges");
    const payload = new TextDecoder("utf-8", { fatal: true }).decode(memo.data);
    createGpruTinDebitMemoInstructionV1({ authority: accounts.authority, payload, publicInputs, expectedLeg: leg as 0 | 1 });
    return payload;
  }) as [string, string];
  return { kind: "TIN_DEBIT", signature, slot, sequence: BigInt(`0x${publicInputs[3]}`) + 1n, oldRoot: publicInputs[0]!, newRoot: publicInputs[1]!,
    memoPayloads, assetEntry: accounts.assetEntry.toBase58(), reserveState: accounts.reserveState.toBase58(), proof,
    action: { actionKind: 4, tokenId: Number(BigInt(`0x${publicInputs[5]}`)), amountCommitment: publicInputs[8]!, authorizationCommitment: publicInputs[9]!, actionCommitment: publicInputs[10]!, nullifier: publicInputs[11]! } };
}

/** Read current funded credits and historical twelve-input receipts for owner recovery only. */
export function decodeFinalizedGpruCreditV1(
  wire: GpruHistoryWireTransactionV1, signature: string, slot: number,
): GpruFinalizedCreditV1 | null {
  check(wire.signatures[0] === signature, "receipt signature differs from transaction bytes");
  const credits = wire.instructions.filter(ix => ix.programId === TSNP.toBase58()
    && [disc("global:tsn_register_tcap_credit_authorization_v2"), disc("global:tsn_register_tcap_credit_authorization_v3")].includes(bytesToHex(ix.data.subarray(0, 8))));
  if (credits.length === 0) return null;
  check(credits.length === 1 && wire.instructions.length === 2 && wire.instructions[0] === credits[0]
    && wire.instructions[1].programId === MEMO, "unsupported credit/Memo instruction order");
  const ix = credits[0];
  const data = Buffer.from(ix.data);
  const privateAmount = data.length === 905 && ix.accounts.length === 16 && bytesToHex(data.subarray(0,8)) === disc("global:tsn_register_tcap_credit_authorization_v3");
  const funded = data.length === 857 && ix.accounts.length === 14;
  const historical = data.length === 825 && ix.accounts.length === 13;
  check(privateAmount || ((funded || historical) && bytesToHex(data.subarray(0,8)) === disc("global:tsn_register_tcap_credit_authorization_v2")), "unsupported native credit ABI");
  const hex = (offset: number) => bytesToHex(data.subarray(offset, offset + 32));
  const auth = hex(8), after = data.readBigUInt64LE(40), expires = data.readBigUInt64LE(48);
  const oldRoot = hex(56), sequence = data.readBigUInt64LE(88);
  const tokenId = data.readUInt32LE(96), amount = privateAmount ? 0n : data.readBigUInt64LE(100);
  const amountCommitment = privateAmount ? hex(100) : undefined, nullifier = hex(privateAmount ? 132 : 108);
  const inputCount = funded || privateAmount ? 13 : 12;
  const inputsOffset = privateAmount ? 164 : 140;
  const inputs = Array.from({ length: inputCount }, (_, index) => hex(inputsOffset + 32 * index));
  const actionOffset = inputsOffset + 32 * inputCount + 256;
  const authorizationCommitment = hex(actionOffset + (privateAmount ? 37 : 13));
  check(inputs.every(value => BigInt(`0x${value}`) < Q) && BigInt(`0x${authorizationCommitment}`) < Q,
    "noncanonical proof field");
  check(sequence > 0n && tokenId > 0 && (privateAmount ? BigInt(`0x${amountCommitment}`) > 0n && BigInt(`0x${amountCommitment}`) < Q : amount > 0n) && after <= BigInt(slot) && BigInt(slot) <= expires,
    "invalid credit sequence, amount or validity window");
  check(!(funded || privateAmount) || BigInt(`0x${inputs[12]}`) > 0n, "empty funded proof root");
  check(data[actionOffset] === 1 && data.readUInt32LE(actionOffset + 1) === tokenId && (privateAmount ? hex(actionOffset + 5) === amountCommitment : data.readBigUInt64LE(actionOffset + 5) === amount),
    "credit action differs from proof statement");
  check(inputs[0] === oldRoot && inputs[1] !== oldRoot && inputs[4] === nullifier
    && authorizationCommitment === field(auth), "credit fields differ from proof statement");
  const authorizationPreimage = Buffer.alloc(privateAmount ? 60 : 36);
  authorizationPreimage.writeBigUInt64LE(sequence, 0);
  authorizationPreimage.writeBigUInt64LE(after, 8);
  authorizationPreimage.writeBigUInt64LE(expires, 16);
  if (privateAmount) Buffer.from(amountCommitment!, "hex").copy(authorizationPreimage, 24);
  else authorizationPreimage.writeBigUInt64LE(amount, 24);
  authorizationPreimage.writeUInt32LE(tokenId, privateAmount ? 56 : 32);
  const domain = privateAmount ? "TSN_GPRU_TCAP_CREDIT_PRIVATE_V2\0" : funded ? "TSN_GPRU_TCAP_CREDIT_FUNDED_NOTE_V1\0" : "TSN_GPRU_TCAP_CREDIT_HIDDEN_HEAD_V1\0";
  check(hash(Buffer.concat([seed(domain), ROOT.toBuffer(),
    Buffer.from(oldRoot, "hex"), authorizationPreimage, Buffer.from(nullifier, "hex"),
    ...((funded || privateAmount) ? [Buffer.from(inputs[12], "hex")] : []),
    ...(privateAmount ? [new PublicKey(ix.accounts[14]).toBuffer(), new PublicKey(ix.accounts[13]).toBuffer()] : [])])) === auth,
  "authorization digest does not bind the credit");
  const expectedAccounts: Array<[number, PublicKey]> = [
    [1, pda(TSNP, seed("tsn_mother_escrow"))], [2, GPRU_TCAP_PROGRAM_ID], [3, TSNP],
    [4, pda(GPRU_TCAP_PROGRAM_ID, seed("tcap:global-config:v1"))], [6, ROOT],
    [7, pda(GPRU_TCAP_PROGRAM_ID, seed("tcap:reserve-state:v1"), new PublicKey(ix.accounts[5]).toBytes())],
    [8, pda(TSNP, seed("tsn:tcap-authorization:v1"), Buffer.from(auth, "hex"))],
    [9, pda(new PublicKey(DEFAULT_TIP_PROGRAM_ID), seed("tip:route-merkle-root:v1"))],
    [10, pda(GPRU_PROGRAM_ID, seed("gpru:hidden-head-verifier:v1"))],
    [11, SYSVAR_INSTRUCTIONS_PUBKEY], [12, GPRU_PROGRAM_ID],
  ];
  if (funded) expectedAccounts.push([13, FUNDING_ROOT]);
  if (privateAmount) {
    expectedAccounts.push([13, pda(GPRU_TCAP_PROGRAM_ID, seed("tcap:funding-root:v1"))]);
    expectedAccounts.push([15, PublicKey.default]);
  }
  check(expectedAccounts.every(([index, key]) => ix.accounts[index] === key.toBase58()), "noncanonical credit account");
  check(ix.signerAccounts.includes(ix.accounts[0]) && (privateAmount ? [0, 6, 14] : [0, 6, 7]).every(index => ix.writableAccounts.includes(ix.accounts[index])),
    "missing credit signer or writable accounts");
  const memoPayload = new TextDecoder("utf-8", { fatal: true }).decode(wire.instructions[1].data);
  const binding = parseGpruMemoBindingV1(memoPayload);
  const prefix = [binding.successorPortfolioRoot, binding.successorBalancePoint.x, binding.successorBalancePoint.y,
    binding.encryptedBlindingDelta, binding.deltaEphemeralPublicKey.x, binding.deltaEphemeralPublicKey.y];
  check(field(hash(wire.instructions[1].data)) === inputs[2] && binding.actionCommitment === inputs[3]
    && prefix.every((value, index) => value === inputs[index + 6]), "Memo differs from proof-bound public fields");
  return { signature, slot, sequence, oldRoot, newRoot: inputs[1], memoPayload,
    assetEntry: ix.accounts[5], reserveState: ix.accounts[7], fundingProofVersion: privateAmount ? 3 : funded ? 2 : 1,
    ...((funded || privateAmount) ? { fundingRoot: inputs[12] } : {}),
    ...(privateAmount ? { accountingEpoch: ix.accounts[14] } : {}), action: {
      actionKind: 1, tokenId, ...(privateAmount ? { amountCommitment } : { amountBaseUnits: amount.toString() }), actionCommitment: inputs[3],
      authorizationCommitment, nullifier,
    } };
}

type RootSnapshot = { currentRoot: string; previousRoot: string; sequence: bigint; slot: number };
async function readRoot(connection: Connection): Promise<RootSnapshot> {
  const result = await connection.getAccountInfoAndContext(ROOT, "finalized");
  const account = result.value;
  check(account && account.owner.equals(GPRU_TCAP_PROGRAM_ID), "canonical TCAP root account is unavailable");
  const data = Buffer.from(account!.data);
  check(data.length === 124 && bytesToHex(data.subarray(0, 8)) === disc("account:TcapCommitmentRootStateV1")
    && data.readUInt16LE(8) === 1 && data[88] === 1, "unsupported TCAP root history layout");
  return { currentRoot: bytesToHex(data.subarray(12, 44)), previousRoot: bytesToHex(data.subarray(44, 76)),
    sequence: data.readBigUInt64LE(80), slot: result.context.slot };
}

/** Require every global transition from the activated empty root through the finalized snapshot. */
export function validateGpruGlobalCreditHistoryV1(credits: readonly GpruFinalizedTransitionV1[], snapshot: RootSnapshot): void {
  check(BigInt(credits.length) === snapshot.sequence, "finalized global history is incomplete or contains unsupported transitions");
  let root = EMPTY_ROOT;
  const nullifiers = new Set<string>();
  credits.forEach((credit, index) => {
    check(credit.sequence === BigInt(index + 1) && credit.oldRoot === root, "global sequence or root chain has a gap");
    check(!nullifiers.has(credit.action.nullifier), "global credit history repeats a nullifier");
    nullifiers.add(credit.action.nullifier);
    root = credit.newRoot;
  });
  check(root === snapshot.currentRoot, "history does not reach the finalized TCAP root");
  if (credits.length > 0) check(credits[credits.length - 1].oldRoot === snapshot.previousRoot, "latest predecessor root mismatch");
}

/** Raw RPC avoids web3.js's legacy/v0 JSON message decoder for native Solana V1. */
async function readRawTransaction(connection: Connection, signature: string): Promise<any> {
  const request = (connection as unknown as { _rpcRequest: (method: string, args: unknown[]) => Promise<any> })._rpcRequest;
  check(typeof request === "function", "this Solana connection cannot read raw transaction receipts");
  const response = await request.call(connection, "getTransaction", [signature,
    { encoding: "base64", commitment: "finalized", maxSupportedTransactionVersion: 1 }]);
  check(response && !response.error && response.result, "finalized transaction receipt is unavailable from this RPC");
  const receipt = response.result;
  check(receipt.meta && receipt.meta.err === null && Number.isSafeInteger(receipt.slot)
    && Array.isArray(receipt.transaction) && receipt.transaction[1] === "base64", "invalid finalized transaction receipt");
  return receipt;
}

/** Read only public finalized credits. No owner key material enters RPC calls. */
export async function loadGpruFinalizedCreditHistoryV1(params: {
  connection: Connection; signal?: AbortSignal; onProgress?: (message: string) => void;
}): Promise<{ credits: GpruFinalizedTransitionV1[]; snapshot: RootSnapshot }> {
  const aborted = () => params.signal?.throwIfAborted();
  aborted();
  const snapshot = await readRoot(params.connection);
  check(snapshot.sequence <= 10_000n, "history exceeds this reader's 10000-transition limit");
  const credits: GpruFinalizedTransitionV1[] = [];
  const seen = new Set<string>();
  let before: string | undefined;
  // Admin transactions also touch the shared root; bound scanning explicitly.
  for (let page = 0; snapshot.sequence > 0n && page < 100; page++) {
    aborted();
    const signatures = await params.connection.getSignaturesForAddress(ROOT,
      { limit: 100, ...(before ? { before } : {}), minContextSlot: snapshot.slot }, "finalized");
    if (signatures.length === 0) break;
    for (const entry of signatures) {
      aborted();
      check(!seen.has(entry.signature), "RPC repeated a transaction history page");
      seen.add(entry.signature);
      if (entry.slot > snapshot.slot || entry.err !== null) continue;
      const receipt = await readRawTransaction(params.connection, entry.signature);
      check(receipt.slot === entry.slot, "transaction slot differs from its finalized history entry");
      const encoded = receipt.transaction[0];
      check(typeof encoded === "string" && encoded.length <= 5464 && /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded),
        "invalid raw transaction encoding");
      const wire = decodeGpruHistoryTransactionV1(Buffer.from(encoded, "base64"));
      const credit = decodeFinalizedGpruCreditV1(wire, entry.signature, entry.slot) ?? decodeFinalizedGpruTinDebitV1(wire, entry.signature, entry.slot);
      if (credit) credits.push(credit);
    }
    params.onProgress?.(`Reading finalized TIN balance history (${credits.length} shared transitions checked)...`);
    if (BigInt(credits.length) >= snapshot.sequence) break;
    before = signatures[signatures.length - 1].signature;
  }
  credits.sort((a, b) => a.sequence < b.sequence ? -1 : a.sequence > b.sequence ? 1 : 0);
  validateGpruGlobalCreditHistoryV1(credits, snapshot);
  aborted();
  const current = await readRoot(params.connection);
  check(current.sequence === snapshot.sequence && current.currentRoot === snapshot.currentRoot
    && current.previousRoot === snapshot.previousRoot, "TCAP root changed during recovery; refresh the balance");
  return { credits, snapshot };
}

async function resolveAsset(connection: Connection, credit: GpruFinalizedTransitionV1, minContextSlot: number) {
  const address = new PublicKey(credit.assetEntry);
  const response = await connection.getAccountInfoAndContext(address, { commitment: "finalized", minContextSlot });
  const account = response.value;
  check(account && account.owner.equals(GPRU_TCAP_PROGRAM_ID), "governed TCAP asset entry is unavailable");
  const data = Buffer.from(account!.data);
  check(data.length === 287 && bytesToHex(data.subarray(0, 8)) === disc("account:TcapAssetEntryV1")
    && data.readUInt16LE(8) === 1 && data.subarray(12, 44).equals(REGISTRY.toBuffer())
    && data.readUInt32LE(44) === credit.action.tokenId && data[244] <= 18, "governed asset layout or token binding mismatch");
  const tokenProgram = new PublicKey(data.subarray(48, 80)), mint = new PublicKey(data.subarray(80, 112));
  check(pda(GPRU_TCAP_PROGRAM_ID, seed("tcap:asset-entry:v1"), REGISTRY.toBytes(), tokenProgram.toBytes(), mint.toBytes()).equals(address)
    && new PublicKey(data.subarray(148, 180)).toBase58() === credit.reserveState, "governed mint or reserve binding mismatch");
  // Reading an existing balance is permitted even if new deposits are paused.
  return { mint: mint.toBase58(), decimals: data[244] };
}

type OwnerHistoryParams = {
  connection: Connection; masterSeed: Uint8Array; gpruElgamalPublicKey: Uint8Array;
  gpruBalanceScanPublicKeyX: Uint8Array; gpruBalanceScanPublicKeyY: Uint8Array;
  signal?: AbortSignal; onProgress?: (message: string) => void;
};

async function loadTinGpruOwnerHistoryV1(params: OwnerHistoryParams) {
  check(bytesToHex(deriveGpruElgamalPublicKey(params.masterSeed)) === bytesToHex(params.gpruElgamalPublicKey),
    "owner seed differs from the registered GPRU key");
  const scanKey = deriveGpruBalanceScanKeyV1(params.masterSeed);
  try {
    check(scanKey.publicKey.x.toString(16).padStart(64, "0") === bytesToHex(params.gpruBalanceScanPublicKeyX)
      && scanKey.publicKey.y.toString(16).padStart(64, "0") === bytesToHex(params.gpruBalanceScanPublicKeyY),
      "owner seed differs from the registered balance scan key");
  } finally { scanKey.secret = 0n; }
  const { credits, snapshot } = await loadGpruFinalizedCreditHistoryV1(params);
  const actions: Array<{ sequence: string; memoCommitment: string }> = [];
  const balances = new Map<number, bigint>();
  const blindings = new Map<number, bigint>();
  let ownerSequence = 0n, previousMemo = "0".repeat(64);
  const assets = new Map<number, { mint: string; decimals: number; address: string }>();
  const latestPoints = new Map<number, { x: string; y: string }>();
  for (const credit of credits) {
    params.signal?.throwIfAborted();
    let owned: { record: { sequence: string; previousMemoCommitment: string; tokenId: number; amountBaseUnits: string }; delta: bigint;
      memoPayload: string; point: { x: string; y: string }; sign: bigint } | undefined;
    try {
      if ("kind" in credit) {
        for (const leg of [0, 1] as const) {
          const memoPayload = credit.memoPayloads[leg];
          try {
            const decoded = decryptGpruTinDebitOwnerRecordV1({ ...params, memoPayload, publicInputs: credit.proof.publicInputs, expectedLeg: leg });
            check(!owned, "both transfer legs authenticate under one owner");
            owned = { record: decoded.record, delta: BigInt(decoded.balanceBlindingDelta), memoPayload,
              point: parseGpruTinDebitMemoBindingV1(memoPayload).successorBalancePoint, sign: leg === 0 ? -1n : 1n };
          } catch (error) { if (!(error instanceof GpruMemoAuthenticationErrorV1)) throw error; }
        }
        if (!owned) continue;
      } else {
        const record = decryptGpruLedgerMemoV1({ ...params, memoPayload: credit.memoPayload });
        assertGpruMemoActionMatchesProofV1(record, credit.action);
        owned = { record, delta: BigInt(record.balanceBlindingDelta), memoPayload: credit.memoPayload,
          point: parseGpruMemoBindingV1(credit.memoPayload).successorBalancePoint, sign: record.actionKind === 1 ? 1n : -1n };
      }
    }
    catch (error) {
      // All recipients share this root. Skip only well-framed records whose
      // Secretbox cannot open under this owner's registered key.
      if (error instanceof GpruMemoAuthenticationErrorV1) continue;
      throw error;
    }
    const { record, memoPayload, delta, point, sign } = owned!;
    check(BigInt(record.sequence) === ownerSequence + 1n, "owner Memo history has a sequence gap");
    check(record.previousMemoCommitment === previousMemo, "owner Memo history has a predecessor gap");
    check(record.tokenId === credit.action.tokenId, "owner record token differs from accepted action");
    const amount = (balances.get(record.tokenId) ?? 0n) + sign * BigInt(record.amountBaseUnits);
    check(amount >= 0n && amount < (1n << 128n), "owner balance is outside u128");
    const blind = ((blindings.get(record.tokenId) ?? 0n) + delta) % 2736030358979909402780800718157159386076813972158567259200215660948447373041n;
    const derivedPoint = deriveGpruTinDebitBalancePointV1(amount.toString(), blind.toString());
    check(derivedPoint.x.toString(16).padStart(64, "0") === point.x && derivedPoint.y.toString(16).padStart(64, "0") === point.y,
      "owner opening differs from accepted successor point");
    balances.set(record.tokenId, amount); blindings.set(record.tokenId, blind);
    ownerSequence += 1n; previousMemo = field(hash(new TextEncoder().encode(memoPayload)));
    actions.push({ sequence: record.sequence, memoCommitment: previousMemo });
    latestPoints.set(record.tokenId, point);
    const existing = assets.get(credit.action.tokenId);
    if (existing) check(existing.address === credit.assetEntry, "one token ID names multiple asset entries");
    else assets.set(credit.action.tokenId, { ...await resolveAsset(params.connection, credit, snapshot.slot), address: credit.assetEntry });
  }
  const recovered = actions.length ? { latestSequence: ownerSequence.toString(), actions,
    balances: [...balances.entries()].sort(([a], [b]) => a - b).map(([tokenId, amount]) => ({ tokenId,
      amountBaseUnits: amount.toString(), blindingScalar: blindings.get(tokenId)!.toString() })) } : null;
  return { recovered, assets, snapshot, latestPoints, actionCount: actions.length };
}

export async function loadTinGpruTokenBalancesV1(params: OwnerHistoryParams): Promise<{
  tokenBalances: Array<{ tokenId: number; mint: string; decimals: number; balanceBaseUnits: string }>;
  latestGlobalSequence: string; latestOwnerSequence: string; actionCount: number;
}> {
  const { recovered, assets, snapshot, actionCount } = await loadTinGpruOwnerHistoryV1(params);
  return {
    tokenBalances: (recovered?.balances ?? []).map(balance => ({ tokenId: balance.tokenId,
      mint: assets.get(balance.tokenId)!.mint, decimals: assets.get(balance.tokenId)!.decimals,
      balanceBaseUnits: balance.amountBaseUnits })),
    latestGlobalSequence: snapshot.sequence.toString(), latestOwnerSequence: recovered?.latestSequence ?? "0",
    actionCount,
  };
}

/** Private owner-seed scope only; the high-level wallet-authorized callback owns consent. */
export async function loadTinGpruDebitOpeningV1(params: OwnerHistoryParams & {
  tokenId: number; expectedGlobalRoot: string; expectedRootSequence: string;
}): Promise<GpruTinDebitOwnerOpeningV1> {
  check(Number.isInteger(params.tokenId) && params.tokenId > 0 && params.tokenId <= 0xffff_ffff,
    "transfer opening requires a positive u32 token ID");
  const { recovered, snapshot, latestPoints } = await loadTinGpruOwnerHistoryV1(params);
  const current = await readRoot(params.connection);
  check(snapshot.currentRoot === params.expectedGlobalRoot && snapshot.sequence.toString() === params.expectedRootSequence
    && current.currentRoot === snapshot.currentRoot && current.previousRoot === snapshot.previousRoot
    && current.sequence === snapshot.sequence, "transfer opening does not match the selected current root and sequence");
  params.signal?.throwIfAborted();
  const selected = recovered?.balances.find(balance => balance.tokenId === params.tokenId);
  if (selected) {
    const point = deriveGpruTinDebitBalancePointV1(selected.amountBaseUnits, selected.blindingScalar);
    const expected = latestPoints.get(params.tokenId)!;
    check(point.x.toString(16).padStart(64, "0") === expected.x && point.y.toString(16).padStart(64, "0") === expected.y,
      "recovered transfer opening differs from the finalized owner balance point");
  }
  return { tokenId: params.tokenId, balance: selected?.amountBaseUnits ?? "0", blinding: selected?.blindingScalar ?? "0",
    sequence: recovered?.latestSequence ?? "0", previousMemoCommitment: recovered?.actions.at(-1)?.memoCommitment ?? "0".repeat(64) };
}
