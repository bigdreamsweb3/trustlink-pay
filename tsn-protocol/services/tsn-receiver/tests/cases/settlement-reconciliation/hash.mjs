import { createHash } from "node:crypto";

export function hash(x) {
    return createHash("sha256").update(x).digest();
}
