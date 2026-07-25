import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const question = process.argv.slice(2).join(" ") || "Summarize the latest run.";
const entries = (await fs.readdir(path.join(root, "protocol-test-runs"), { withFileTypes: true })).filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
if (!entries.length) throw new Error("No saved protocol-test-runs exist");
const latest = path.join(root, "protocol-test-runs", entries.at(-1));
const summary = await fs.readFile(path.join(latest, "ai-executive-summary.md"), "utf8");
console.log(`Daniel asked: ${question}\n\nLatest Claude Protocol Observer report (${entries.at(-1)}):\n\n${summary}`);
