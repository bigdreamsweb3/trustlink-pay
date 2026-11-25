// Limit ffjavascript's verification worker discovery in this child process only.
// Proving uses its supported singleThread option; witness pages are an initial allocation, not an RSS cap.
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
const navigatorValue = globalThis.navigator ?? {};
Object.defineProperty(navigatorValue, "hardwareConcurrency", { value: 1, configurable: true });
if (!globalThis.navigator) Object.defineProperty(globalThis, "navigator", { value: navigatorValue, configurable: true });
const pages = Number(process.env.TSN_PROVER_WASM_PAGES ?? 8192);
if (!Number.isInteger(pages) || pages < 1024 || pages > 32768) throw new Error("TSN_PROVER_WASM_PAGES_INVALID");
export const localProverOptions = Object.freeze({ witness: Object.freeze({ memorySize: pages }), prover: Object.freeze({ singleThread: true }) });

/** Keep metadata pin checks byte-identical without buffering an entire proving key. */
export async function hashProverFile(filename) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(filename, { highWaterMark: 1024 * 1024 })) hash.update(chunk);
  return hash.digest("hex");
}
