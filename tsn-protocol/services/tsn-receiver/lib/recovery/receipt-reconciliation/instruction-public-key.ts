import { PublicKey } from "@solana/web3.js";

/** instructionPublicKey component. Inputs and results retain the original settlement-reconciliation contract; declared dependencies identify replaceable ports. Errors propagate in their original order. */
export function instructionPublicKey(context: { keys: PublicKey[] }, index: number) {
const { keys } = context;
return keys[index];
}
