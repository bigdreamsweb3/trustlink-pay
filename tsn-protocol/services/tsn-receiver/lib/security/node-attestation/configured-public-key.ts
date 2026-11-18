import type { Dependencies } from "./dependencies";
import { createPublicKey } from "node:crypto";

/** configuredPublicKey component. Inputs and results retain the original node-verification contract; declared dependencies identify replaceable ports. Errors propagate in their original order. */
export function configuredPublicKey(dependencies: Pick<Dependencies, "environment">) {
  const encoded = dependencies.environment.TSN_NODE_VERIFICATION_PUBLIC_KEY?.trim();
  if (!encoded) throw new Error("NODE_VERIFICATION_PUBLIC_KEY_NOT_CONFIGURED");
  let raw: Buffer;
  if (/^[0-9a-fA-F]{64}$/.test(encoded)) raw = Buffer.from(encoded, "hex");
  else {
    raw = Buffer.from(encoded, "base64");
    if (raw.length !== 32 || raw.toString("base64").replace(/=+$/, "") !== encoded.replace(/=+$/, "")) {
      throw new Error("NODE_VERIFICATION_PUBLIC_KEY_INVALID");
    }
  }
  return {
    raw,
    key: createPublicKey({
      key: Buffer.concat([Buffer.from("302a300506032b6570032100", "hex"), raw]),
      format: "der",
      type: "spki",
    }),
  };
}
