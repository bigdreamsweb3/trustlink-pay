import { createHash } from "node:crypto";
import { stable } from "../contracts/commitments/stable";
import type { RelayRequest } from "./types";

/** Fixed ASCII envelope keys make this canonical encoding match the local Node's JSON encoder. */
export function relayRequestHash(request: RelayRequest): string {
  return createHash("sha256").update(stable(request), "utf8").digest("hex");
}
