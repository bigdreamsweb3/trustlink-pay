import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const EXPECTED_ID = "TcApT4CytBqvqEDpRYVB7Wfi6aFzmtSZdWvDsq6bp9x";

const root = fileURLToPath(new URL("..", import.meta.url));
const rust = readFileSync(resolve(root, "programs/tcap/src/lib.rs"), "utf8");
const anchor = readFileSync(resolve(root, "Anchor.toml"), "utf8");
const sdk = readFileSync(resolve(root, "tcap-sdk/src/program-id.ts"), "utf8");
const rustId = rust.match(/declare_id!\(\"([^\"]+)\"\)/)?.[1];
const anchorId = anchor.match(/^tcap\s*=\s*\"([^\"]+)\"/m)?.[1];
const sdkId = sdk.match(/TCAP_PROGRAM_ID\s*=\s*\"([^\"]+)\"/)?.[1];
if (!rustId || !anchorId || !sdkId) throw new Error("missing TCAP program ID declaration");
if (new Set([rustId, anchorId, sdkId]).size !== 1) {
  throw new Error(`TCAP program ID mismatch: rust=${rustId} anchor=${anchorId} sdk=${sdkId}`);
}
if (rustId !== EXPECTED_ID) throw new Error(`unexpected TCAP program ID: ${rustId}`);

// A Solana keypair JSON contains 32 secret bytes followed by 32 public bytes.
// We only inspect a local development keypair when present; no key material is printed.
const keyDir = resolve(root, "tcap-program-keys");
const candidates = ["tcap-program-keypair.json", "tcap-program-keypair.json.json"];
const keyPath = candidates.map((name) => resolve(keyDir, name)).find(existsSync);
if (keyPath) {
  const result = spawnSync("solana-keygen", ["pubkey", keyPath], { encoding: "utf8" });
  if (result.error) throw new Error(`solana-keygen pubkey failed: ${result.error.message}`);
  if (result.status !== 0) throw new Error(`solana-keygen pubkey failed with exit code ${result.status}`);
  if (result.stdout.trim() !== EXPECTED_ID) throw new Error("deployment keypair public key does not match TCAP_PROGRAM_ID");
} else {
  throw new Error("TCAP deployment keypair not found");
}
console.log(`TCAP program ID consistent: ${rustId}`);
