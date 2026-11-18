import { PublicKey } from "@solana/web3.js";

/** isMotherAuthority component. Inputs and results retain the original settlement-reconciliation contract; declared dependencies identify replaceable ports. Errors propagate in their original order. */
export function isMotherAuthority(context: { authority: PublicKey }, k: PublicKey) {
const { authority } = context;
return k.equals(authority);
}
