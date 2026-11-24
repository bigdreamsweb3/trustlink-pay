import { PublicKey } from "@solana/web3.js";
import { hash } from "./hash";
import { bytes } from "./bytes";
import { TSNP, TCAP, TIP, GPRU } from "./configuration";

/** Validate the exact signed debit statement, Memo pair and finalized shared root. */
export function assertTinDebitReceipt(t: Record<string, any>, signature: string, slot: number, message: Buffer,
    keys: PublicKey[], instructions: { program: PublicKey; keys: PublicKey[]; data: Buffer }[], authority: PublicKey, root: any) {
  const names = ["authority", "motherEscrow", "tcapProgram", "tsnProgram", "config", "assetEntry", "commitmentRoot", "reserveState", "authorizationSigner", "tipRouteRoot", "tinDebitVerifier", "instructions", "gpruProgram"];
  const expectedKeys = names.map(name => new PublicKey(t[name]));
  const derive = (program: PublicKey, seed: string, ...extra: Buffer[]) => PublicKey.findProgramAddressSync([Buffer.from(seed), ...extra], program)[0];
  const canonical = [authority, derive(TSNP, "tsn_mother_escrow"), TCAP, TSNP, derive(TCAP, "tcap:global-config:v1"), expectedKeys[5],
    derive(TCAP, "tcap:commitment-root:v1"), derive(TCAP, "tcap:reserve-state:v1", expectedKeys[5].toBuffer()),
    derive(TSNP, "tsn:tcap-authorization:v1", bytes(t.authorizationDigest, 32)), derive(TIP, "tip:route-merkle-root:v1"),
    derive(GPRU, "gpru:tin-debit-verifier:v1"), new PublicKey("Sysvar1nstructions1111111111111111111111111"), GPRU];
  const proof = t.proof;
  if (!Array.isArray(proof?.publicInputs) || proof.publicInputs.length !== 26 || !expectedKeys.every((key, index) => key.equals(canonical[index]))) throw new Error("TIN_DEBIT_RECEIPT_ACCOUNTS_INVALID");
  const expected = Buffer.concat([hash("global:tsn_register_tcap_tin_debit_authorization_v1").subarray(0, 8), bytes(t.authorizationDigest, 32),
    ...proof.publicInputs.map((value: string) => bytes(value, 32)), bytes(proof.proofA, 64), bytes(proof.proofB, 128), bytes(proof.proofC, 64)]);
  if (!instructions[0].program.equals(TSNP) || !instructions[0].data.equals(expected) || instructions[0].keys.length !== 13
      || !instructions[0].keys.every((key, index) => key.equals(expectedKeys[index])) || message[2] !== 1 || !keys[1].equals(authority)) throw new Error("TIN_DEBIT_RECEIPT_STATEMENT_INVALID");
  const memoProgram = new PublicKey("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr");
  const allowed = new Set([keys[0], ...expectedKeys, memoProgram].map(key => key.toBase58()));
  if (keys.length !== allowed.size || keys.some(key => !allowed.has(key.toBase58()))) throw new Error("TIN_DEBIT_RECEIPT_ACCOUNTS_INVALID");
  for (let index = 0; index < keys.length; index++) {
    const writable = index === 0 || (index >= 2 && index < keys.length - message[3]);
    if (writable !== (index === 0 || keys[index].equals(expectedKeys[6]))) throw new Error("TIN_DEBIT_RECEIPT_PERMISSIONS_INVALID");
  }
  for (let leg = 0; leg < 2; leg++) {
    const memo = instructions[leg + 1];
    if (!memo.program.equals(memoProgram) || memo.keys.length !== 1 || !memo.keys[0].equals(authority)
        || !memo.data.equals(Buffer.from(t.memoPayloads[leg], "ascii")) || memo.data.length !== 582) throw new Error("TIN_DEBIT_RECEIPT_MEMO_INVALID");
  }
  const data = Buffer.from(root?.data?.[0] ?? "", "base64"), sequence = BigInt(t.tcapRootSequence);
  if (root?.owner !== TCAP.toBase58() || data.length !== 124 || !data.subarray(0, 8).equals(hash("account:TcapCommitmentRootStateV1").subarray(0, 8))
      || data.readBigUInt64LE(80) < sequence || (data.readBigUInt64LE(80) === sequence && (!data.subarray(12, 44).equals(bytes(proof.publicInputs[1], 32))
      || !data.subarray(44, 76).equals(bytes(proof.publicInputs[0], 32))))) throw new Error("TIN_DEBIT_RECEIPT_ROOT_INVALID");
  return { signature, stage: "TCAP_GPRU_TIN_DEBIT_V1_CONFIRMED", sequence: t.tcapRootSequence as string,
    authorizationDigest: t.authorizationDigest as string, slot, confirmationStatus: "finalized" };
}
