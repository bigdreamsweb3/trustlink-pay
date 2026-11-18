import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { sourceFiles } from "./source-files.mjs";
import { inspectSource } from "./inspect-source.mjs";
import { importIntegrity } from "./import-integrity.mjs";

const root = path.resolve(fileURLToPath(new URL("../", import.meta.url)));
const files = [];
for (const relative of sourceFiles(root)) files.push(inspectSource(root, relative));
const multiple = [], syntax = [], forbidden = [], bodies = new Map();
let count = 0;
for (const file of files) {
  count += file.functions.length;
  if (file.functions.length > 1) multiple.push(file.path);
  if (file.syntaxErrors.length) syntax.push(file.path);
  if (file.forbidden.length && /^(?:lib|app)\//.test(file.path)) forbidden.push(file.path);
  for (const component of file.functions) {
    component.bodySha256 = createHash("sha256").update(component.bodyHashInput).digest("hex");
    delete component.bodyHashInput;
    const matches = bodies.get(component.bodySha256) ?? [];
    matches.push(`${file.path}:${component.name}`); bodies.set(component.bodySha256, matches);
  }
}
const production = [], tests = [], duplicates = [];
let productionFunctions = 0;
for (const file of files) {
  if (/^(?:lib|app)\//.test(file.path)) { production.push(file); productionFunctions += file.functions.length; }
  if (file.path.startsWith("tests/")) tests.push(file);
}
for (const matches of bodies.values()) if (matches.length > 1) duplicates.push(matches);
const integrity = importIntegrity(production);
const testIntegrity = importIntegrity(files);
const report = { sourceFiles: files.length, authoredFunctions: count, productionFiles: production.length,
  productionFunctions,
  multipleFunctionFiles: multiple, syntaxErrorFiles: syntax, forbiddenProductionFiles: forbidden,
  missingProductionImports: integrity.missing, valueImportCycles: integrity.cycles,
  missingAuthoredImports: testIntegrity.missing, duplicateBodies: duplicates };
const inventory = { format: "TSN_RECEIVER_MCES_INVENTORY", version: 1, scope: "app and lib authored source; generated output, installed dependencies, diagnostic scripts and deployment configuration excluded", files: production };
if (process.argv.includes("--write")) {
  fs.mkdirSync(path.join(root, "core"), { recursive: true });
  fs.writeFileSync(path.join(root, "core/component_inventory.json"), JSON.stringify(inventory, null, 2) + "\n");
  fs.writeFileSync(path.join(root, "tests/cases/COMPONENTS.json"), JSON.stringify({ format: "TSN_RECEIVER_MCES_TEST_INVENTORY", version: 1, files: tests }, null, 2) + "\n");
  fs.writeFileSync(path.join(root, "core/architectural-audit.json"), JSON.stringify(report, null, 2) + "\n");
}
console.log(JSON.stringify(report, null, 2));
// Graph cycles require review; deferred class factories/recursive functions can be safe ESM cycles.
if (multiple.length || syntax.length || forbidden.length || integrity.missing.length || testIntegrity.missing.length) process.exitCode = 1;
