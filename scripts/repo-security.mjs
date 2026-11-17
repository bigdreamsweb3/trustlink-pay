export * from "../tsn-protocol/scripts/repo-security.mjs";
import { main } from "../tsn-protocol/scripts/repo-security.mjs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(process.argv.slice(2)); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
