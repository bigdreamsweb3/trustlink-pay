import type { Dependencies } from "./dependencies";
import { CHALLENGE_TTL_MS } from "./configuration";

/** validTimestamp component. Inputs and results retain the original cranker-auth contract; declared dependencies identify replaceable ports. Errors propagate in their original order. */
export function validTimestamp(dependencies: Pick<Dependencies, "clock">, timestamp: string) {
  const timestampMs = Number(timestamp) * 1000;
  return Number.isFinite(timestampMs) && Math.abs(dependencies.clock.now() - timestampMs) <= CHALLENGE_TTL_MS;
}
