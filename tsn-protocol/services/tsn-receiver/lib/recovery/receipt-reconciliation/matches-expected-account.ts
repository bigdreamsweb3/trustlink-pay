import { PublicKey } from "@solana/web3.js";

/** matchesExpectedAccount component. Inputs and results retain the original settlement-reconciliation contract; declared dependencies identify replaceable ports. Errors propagate in their original order. */
export function matchesExpectedAccount(context: { expectedKeys: PublicKey[] }, k: PublicKey, i: number) {
const { expectedKeys } = context;
return k.equals(expectedKeys[i]);
}
