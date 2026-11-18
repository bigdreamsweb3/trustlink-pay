import type { Dependencies } from "./dependencies";

/** key component. Inputs and results retain the original node-envelope contract; declared dependencies identify replaceable ports. Errors propagate in their original order. */
export function key(dependencies: Pick<Dependencies, "environment">) {
  const value = (dependencies.environment.TSN_RECEIVER_NODE_PAYLOAD_KEY ?? "").trim();
  if (!value) throw new Error("NODE_PAYLOAD_ENCRYPTION_KEY_REQUIRED");
  const bytes = /^[a-f0-9]{64}$/i.test(value) ? Buffer.from(value, "hex") : Buffer.from(value, "base64");
  if (bytes.length !== 32) throw new Error("NODE_PAYLOAD_ENCRYPTION_KEY_INVALID");
  return bytes;
}
