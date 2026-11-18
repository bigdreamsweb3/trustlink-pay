import { PublicKey } from "@solana/web3.js";

/** equalsWritableAccount component. Inputs and results retain the original settlement-reconciliation contract; declared dependencies identify replaceable ports. Errors propagate in their original order. */
export function equalsWritableAccount(context: { k: PublicKey }, v: PublicKey) {
const { k } = context;
return v.equals(k);
}
