import { PublicKey } from "@solana/web3.js";
import { isInvalidAccountIndex } from "./is-invalid-account-index";
import { instructionPublicKey } from "./instruction-public-key";

/** parseReceiptInstructions component. Inputs and results retain the original settlement-reconciliation contract; declared dependencies identify replaceable ports. Errors propagate in their original order. */
export function parseReceiptInstructions(message: Buffer, cursor: number, count: number, instructionCount: number, keys: PublicKey[]) {
  const headers: { program: number; count: number; size: number }[] = [];
  for (let index = 0; index < instructionCount; index += 1) {
    const header = { program: message[cursor], count: message[cursor + 1], size: message.readUInt16LE(cursor + 2) };
    cursor += 4;
    headers.push(header);
  }
  const instructions: { program: PublicKey; keys: PublicKey[]; data: Buffer }[] = [];
  for (const header of headers) {
    const indexes = [...message.subarray(cursor, cursor + header.count)];
    cursor += header.count;
    const data = message.subarray(cursor, cursor + header.size);
    cursor += header.size;
    if (header.program >= count || indexes.some(isInvalidAccountIndex.bind(null, { count })) || data.length !== header.size) throw new Error("SETTLEMENT_RECEIPT_INVALID_WIRE");
    instructions.push({ program: keys[header.program], keys: indexes.map(instructionPublicKey.bind(null, { keys })), data });
  }
  return { instructions, cursor };
}
