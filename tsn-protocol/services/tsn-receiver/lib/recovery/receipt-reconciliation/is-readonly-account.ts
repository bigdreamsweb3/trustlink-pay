import { PublicKey } from "@solana/web3.js";
import { equalsWritableAccount } from "./equals-writable-account";

/** isReadonlyAccount component. Inputs and results retain the original settlement-reconciliation contract; declared dependencies identify replaceable ports. Errors propagate in their original order. */
export function isReadonlyAccount(context: { writable: PublicKey[] }, k: PublicKey) {
const { writable } = context;
return !writable.some(equalsWritableAccount.bind(null, { k }));
}
