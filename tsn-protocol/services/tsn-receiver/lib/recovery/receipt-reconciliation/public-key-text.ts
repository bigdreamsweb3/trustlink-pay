import { PublicKey } from "@solana/web3.js";

/** publicKeyText component. Inputs and results retain the original settlement-reconciliation contract; declared dependencies identify replaceable ports. Errors propagate in their original order. */
export function publicKeyText(k: PublicKey) {
return k.toBase58();
}
