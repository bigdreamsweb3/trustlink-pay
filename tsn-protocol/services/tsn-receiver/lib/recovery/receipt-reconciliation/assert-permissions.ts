import { PublicKey } from "@solana/web3.js";
import { publicKeyText } from "./public-key-text";
import { isUnexpectedAccount } from "./is-unexpected-account";
import { isReadonlyAccount } from "./is-readonly-account";

/** assertPermissions component. Inputs and results retain the original settlement-reconciliation contract; declared dependencies identify replaceable ports. Errors propagate in their original order. */
export function assertPermissions(keys: PublicKey[], message: Buffer, authority: PublicKey,
    accounts: PublicKey[], writable: PublicKey[], program: PublicKey, memo?: PublicKey) {
  const expected = new Set([keys[0],...accounts,program,...(memo ? [memo] : [])].map(publicKeyText));
  const names=keys.map(publicKeyText), n=keys.length-2-message[3];
  if (message[2] !== 0 || !keys[1].equals(authority) || new Set(names).size !== names.length
      || names.length !== expected.size || names.some(isUnexpectedAccount.bind(null, { expected })) || n<0
      || n !== writable.length || keys.slice(2,2+n).some(isReadonlyAccount.bind(null, { writable }))) {
    throw new Error("SETTLEMENT_RECEIPT_ACCOUNT_PERMISSIONS_MISMATCH");
  }
}
