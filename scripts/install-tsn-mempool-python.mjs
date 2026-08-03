import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const python = process.platform === "win32" ? "python" : "python3";
const requirements = resolve(rootDir, "tsn-protocol", "tsn-node", "requirements.txt");

const child = spawn(
  python,
  ["-m", "pip", "install", "--upgrade", "-r", requirements],
  { cwd: rootDir, stdio: "inherit", shell: false },
);

child.on("error", (error) => {
  console.error(`Failed to start ${python}: ${error.message}`);
  process.exit(1);
});

child.on("exit", (code, signal) => {
  if (signal) {
    console.error(`Python dependency installation stopped by ${signal}.`);
    process.exit(1);
  }
  process.exit(code ?? 1);
});
