import { createPublicKey } from "node:crypto";
import { decodeBase58 } from "./decode-base58";

/** publicKeyObject component. Inputs and results retain the original cranker-auth contract; declared dependencies identify replaceable ports. Errors propagate in their original order. */
export function publicKeyObject(publicKey: string) {
  return createPublicKey({
    key: Buffer.concat([Buffer.from("302a300506032b6570032100", "hex"), decodeBase58(publicKey)]),
    format: "der",
    type: "spki",
  });
}
