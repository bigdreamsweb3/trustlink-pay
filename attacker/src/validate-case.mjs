import { readFileSync } from "node:fs";

const allowedFamilies = new Set([
  "wrong-owner",
  "wrong-pda",
  "forged-authority",
  "duplicate-init",
  "nullifier-replay",
  "wrong-asset",
  "paused-transition",
  "arithmetic-overflow",
  "wrong-root",
  "malformed-input",
  "vault-substitution",
]);

const file = process.argv[2];
if (!file) throw new Error("usage: node src/validate-case.mjs <case.json>");
const testCase = JSON.parse(readFileSync(file, "utf8"));
if (!testCase || typeof testCase !== "object") throw new Error("invalid_attack_case");
if (!allowedFamilies.has(testCase.family)) throw new Error("attack_family_not_allowlisted");
if (testCase.network !== "localnet") throw new Error("attack_target_must_be_localnet");
if (typeof testCase.targetProgramId !== "string" || testCase.targetProgramId.length < 32) {
  throw new Error("invalid_target_program_id");
}
if (testCase.execute !== false) throw new Error("generated_cases_must_be_reviewed_before_execution");
console.log(JSON.stringify({ accepted: true, family: testCase.family, network: testCase.network }));
