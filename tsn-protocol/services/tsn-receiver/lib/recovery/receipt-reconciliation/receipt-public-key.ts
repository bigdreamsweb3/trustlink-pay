import { PublicKey } from "@solana/web3.js";

/** receiptPublicKey component. Inputs and results retain the original settlement-reconciliation contract; declared dependencies identify replaceable ports. Errors propagate in their original order. */
export function receiptPublicKey(context: { message: Buffer<ArrayBuffer> }, _: any, i: number) {
const { message } = context;
return new PublicKey(message.subarray(42 + i * 32, 74 + i * 32));
}
