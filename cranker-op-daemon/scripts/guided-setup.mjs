import { access, copyFile, readFile } from "node:fs/promises";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { resolve } from "node:path";
import { spawn } from "node:child_process";

const envPath = resolve(process.cwd(), ".env");
const envExamplePath = resolve(process.cwd(), ".env.example");
const defaultMint = "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU";

async function ensureEnvFile() {
  try {
    await access(envPath);
  } catch {
    await copyFile(envExamplePath, envPath);
    output.write("[guided-setup] Created .env from .env.example\n");
  }
}

async function loadEnvFile() {
  try {
    const raw = await readFile(envPath, "utf8");
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const separator = trimmed.indexOf("=");
      if (separator <= 0) continue;
      const key = trimmed.slice(0, separator).trim();
      const value = trimmed.slice(separator + 1).trim();
      if (!process.env[key]) process.env[key] = value;
    }
  } catch {
    return;
  }
}

function promptDefault(value, fallback = "") {
  return value && value.length > 0 ? value : fallback;
}

function runCli(args) {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(
      process.execPath,
      [resolve(process.cwd(), "./scripts/tsn-setup.mjs"), ...args],
      { stdio: "inherit" },
    );

    child.on("exit", (code) => {
      if (code === 0) {
        resolvePromise();
        return;
      }
      rejectPromise(new Error(`Command failed with exit code ${code ?? 1}`));
    });
  });
}

async function askQuestion(rl, label, fallback = "") {
  const suffix = fallback ? ` [${fallback}]` : "";
  const answer = await rl.question(`${label}${suffix}: `);
  return promptDefault(answer.trim(), fallback);
}

async function chooseAction(rl) {
  output.write(`
TSN Operator Guided Setup
1. Register cranker
2. Set funding policy
3. Initialize vault
4. Fund cranker vault
5. Withdraw cranker funds
6. Force-settle epoch
7. Show raw CLI help
8. Exit
`);
  return askQuestion(rl, "Choose an action", "1");
}

async function main() {
  await ensureEnvFile();
  await loadEnvFile();

  const rl = createInterface({ input, output });
  try {
    const choice = await chooseAction(rl);

    if (choice === "1") {
      await runCli(["register-cranker"]);
      return;
    }

    if (choice === "2") {
      const allowExternalFunding = await askQuestion(
        rl,
        "Allow external funding? true/false",
        "true",
      );
      await runCli(["set-funding-policy", allowExternalFunding]);
      return;
    }

    if (choice === "3") {
      const tokenMint = await askQuestion(rl, "Token mint", defaultMint);
      await runCli(["init-vault", tokenMint]);
      return;
    }

    if (choice === "4") {
      const tokenMint = await askQuestion(rl, "Token mint", defaultMint);
      const funderKeypair = await askQuestion(
        rl,
        "Funder keypair path",
        process.env.KEYPAIR_PATH ?? "./keys/cranker-keypair.json",
      );
      const funderTokenAccount = await askQuestion(
        rl,
        "Funder token account",
      );
      const amountBaseUnits = await askQuestion(
        rl,
        "Amount in base units",
        "20000000",
      );
      await runCli([
        "fund-cranker",
        tokenMint,
        funderKeypair,
        funderTokenAccount,
        amountBaseUnits,
      ]);
      return;
    }

    if (choice === "5") {
      const tokenMint = await askQuestion(rl, "Token mint", defaultMint);
      const funderKeypair = await askQuestion(
        rl,
        "Funder keypair path",
        process.env.KEYPAIR_PATH ?? "./keys/cranker-keypair.json",
      );
      const funderTokenAccount = await askQuestion(
        rl,
        "Funder token account",
      );
      const amountBaseUnits = await askQuestion(
        rl,
        "Amount in base units",
        "1000000",
      );
      await runCli([
        "withdraw-cranker",
        tokenMint,
        funderKeypair,
        funderTokenAccount,
        amountBaseUnits,
      ]);
      return;
    }

    if (choice === "6") {
      await runCli(["settle-epoch", "--force"]);
      return;
    }

    if (choice === "7") {
      await runCli(["--help"]);
      return;
    }

    output.write("[guided-setup] Exiting\n");
  } finally {
    rl.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
