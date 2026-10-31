import { createHash } from "node:crypto";
import { encodeToLedgerSlots } from "@dbrix/ledger";
import { PublicKey, TransactionInstruction } from "@solana/web3.js";

const MEMO_PROGRAM_ID = new PublicKey("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr");

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
      .map(([key, child]) => `${JSON.stringify(key)}:${stableJson(child)}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

export function createDbrixSettlementMemoInstruction(params: {
  payer: PublicKey;
  document: Record<string, unknown>;
  expectedSlots: unknown;
  expectedPayload: unknown;
  expectedMemoPayload: unknown;
  expectedCommitment: unknown;
  successorPortfolioRoot: string;
  successorBalancePoint: { x: string; y: string };
  actionCommitment: string;
}): TransactionInstruction {
  const slots = encodeToLedgerSlots(Buffer.from(stableJson(params.document), "utf8"));
  if (!Array.isArray(params.expectedSlots)
      || params.expectedSlots.length !== slots.length
      || params.expectedSlots.some((slot, index) => slot !== slots[index])) {
    throw new Error("Node DBrix Ledger slots do not match the encrypted transaction record");
  }
  const memoPayload = slots.map((slot) => slot.replace(/=+$/u, "")).join("");
  if (memoPayload !== params.expectedPayload) {
    throw new Error("Node DBrix Memo payload does not match its Ledger slots");
  }
  const pointHex = (value: string, label: string) => {
    if (!/^[0-9a-f]{64}$/iu.test(value)) throw new Error(`${label} must be 32-byte hex`);
    return value.toLowerCase();
  };
  const finalMemoPayload = `TSN_GPRU_HEAD_V1:${pointHex(params.successorPortfolioRoot, "successorPortfolioRoot")}:${pointHex(params.successorBalancePoint.x, "successorBalancePoint.x")}:${pointHex(params.successorBalancePoint.y, "successorBalancePoint.y")}:${pointHex(params.actionCommitment, "actionCommitment")}:${memoPayload}`;
  if (finalMemoPayload !== params.expectedMemoPayload) {
    throw new Error("Node GPRU Memo prefix or owner-encrypted payload differs from the proof-bound transition");
  }
  const commitment = createHash("sha256").update(finalMemoPayload, "ascii").digest("hex");
  if (commitment !== String(params.expectedCommitment ?? "").toLowerCase()) {
    throw new Error("Node DBrix Memo commitment does not match the encoded record");
  }
  return new TransactionInstruction({
    programId: MEMO_PROGRAM_ID,
    keys: [{ pubkey: params.payer, isSigner: true, isWritable: false }],
    data: Buffer.from(finalMemoPayload, "ascii"),
  });
}
