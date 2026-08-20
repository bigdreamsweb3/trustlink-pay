import { access, copyFile, readFile } from "node:fs/promises";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { resolve } from "node:path";
import { spawn } from "node:child_process";
import { tsnGetAllowedSplTokens } from "@trustlink/tsn-cranker-sdk";
import { PublicKey, Keypair } from "@solana/web3.js";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";

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

function assertBase58Pubkey(value, label) {
  try {
    void new PublicKey(value);
  } catch {
    throw new Error(`${label} must be a valid base58 Solana address. Received: "${value}"`);
  }
}

async function loadKeypair(path) {
  const { readFile } = await import("node:fs/promises");
  const raw = await readFile(resolve(process.cwd(), path), "utf8");
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(raw)));
}

async function resolveFunderTokenAccountInput(tokenMint, funderKeypairPath, providedValue) {
  const mint = new PublicKey(tokenMint);
  const funder = await loadKeypair(funderKeypairPath);
  const ata = getAssociatedTokenAddressSync(mint, funder.publicKey);
  const derivedAta = ata.toBase58();
  output.write(`[guided-setup] Funder wallet: ${funder.publicKey.toBase58()}\n`);
  output.write(`[guided-setup] Expected token account (ATA): ${derivedAta}\n`);

  const trimmed = providedValue.trim();
  if (trimmed.length === 0) {
    output.write("[guided-setup] Using expected token account (auto).\n");
    return derivedAta;
  }

  assertBase58Pubkey(trimmed, "Funder token account");
  if (trimmed !== derivedAta) {
    output.write(
      "[guided-setup] Note: provided token account differs from the expected ATA. Continuing with provided account.\n",
    );
  }
  return trimmed;
}

async function chooseAction(rl) {
  output.write(`
TSN Operator Guided Setup
1. Register cranker
2. Set funding policy
3. Initialize vault
4. Fund cranker vault
5. Withdraw cranker funds
6. Show epoch-close policy
7. Show raw CLI help
8. Exit
`);
  return askQuestion(rl, "Choose an action", "1");
}

function printTokenCatalog(tokens) {
  output.write("\nAccepted tokens:\n");
  for (const token of tokens) {
    output.write(`- ${token.symbol} (${token.name}) -> ${token.mintAddress}\n`);
  }
}

function resolveTokenMint(tokenInput, allowedTokens) {
  const trimmed = tokenInput.trim();
  const byMint = allowedTokens.find((token) => token.mintAddress === trimmed);
  if (byMint) return byMint.mintAddress;
  const bySymbol = allowedTokens.find(
    (token) => token.symbol === trimmed.toUpperCase(),
  );
  if (bySymbol) return bySymbol.mintAddress;
  return trimmed;
}

function resolveTokenConfig(tokenInput, allowedTokens) {
  const trimmed = tokenInput.trim();
  const byMint = allowedTokens.find((token) => token.mintAddress === trimmed);
  if (byMint) return byMint;
  const bySymbol = allowedTokens.find(
    (token) => token.symbol === trimmed.toUpperCase(),
  );
  if (bySymbol) return bySymbol;
  return {
    mintAddress: trimmed,
    symbol: trimmed.slice(0, 6).toUpperCase(),
    name: "Custom Token",
    decimals: 6,
  };
}

function uiAmountToBaseUnits(uiAmount, decimals) {
  const normalized = uiAmount.trim();
  if (!/^\d+(\.\d+)?$/.test(normalized)) {
    throw new Error(`Amount must be a positive number. Received: "${uiAmount}"`);
  }

  const [wholePart, fracPartRaw = ""] = normalized.split(".");
  const fracPart = fracPartRaw.slice(0, decimals).padEnd(decimals, "0");
  const whole = BigInt(wholePart);
  const frac = BigInt(fracPart || "0");
  const scale = 10n ** BigInt(decimals);
  return whole * scale + frac;
}

async function main() {
  await ensureEnvFile();
  await loadEnvFile();

  const rl = createInterface({ input, output });
  try {
    const allowedTokens = tsnGetAllowedSplTokens(process.env);
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
      printTokenCatalog(allowedTokens);
      const tokenMint = await askQuestion(
        rl,
        "Token symbol or mint",
        allowedTokens[0]?.symbol ?? defaultMint,
      );
      await runCli(["init-vault", tokenMint]);
      return;
    }

    if (choice === "4") {
      printTokenCatalog(allowedTokens);
      const tokenInput = await askQuestion(
        rl,
        "Token symbol or mint",
        allowedTokens[0]?.symbol ?? defaultMint,
      );
      const tokenConfig = resolveTokenConfig(tokenInput, allowedTokens);
      const tokenMint = resolveTokenMint(tokenInput, allowedTokens);
      const funderKeypair = await askQuestion(
        rl,
        "Funder keypair path",
        process.env.KEYPAIR_PATH ?? "./keys/cranker-keypair.json",
      );
      const funderTokenAccount = await askQuestion(
        rl,
        "Funder token account",
      );
      const resolvedFunderTokenAccount = await resolveFunderTokenAccountInput(
        tokenMint,
        funderKeypair,
        funderTokenAccount,
      );
      const amountUi = await askQuestion(
        rl,
        `Amount (${tokenConfig.symbol})`,
        "20",
      );
      const amountBaseUnits = uiAmountToBaseUnits(
        amountUi,
        Number(tokenConfig.decimals ?? 6),
      ).toString();
      output.write(
        `[guided-setup] ${amountUi} ${tokenConfig.symbol} -> ${amountBaseUnits} base units\n`,
      );
      await runCli([
        "fund-cranker",
        tokenInput,
        funderKeypair,
        resolvedFunderTokenAccount,
        amountBaseUnits,
      ]);
      return;
    }

    if (choice === "5") {
      printTokenCatalog(allowedTokens);
      const tokenInput = await askQuestion(
        rl,
        "Token symbol or mint",
        allowedTokens[0]?.symbol ?? defaultMint,
      );
      const tokenConfig = resolveTokenConfig(tokenInput, allowedTokens);
      const tokenMint = resolveTokenMint(tokenInput, allowedTokens);
      const funderKeypair = await askQuestion(
        rl,
        "Funder keypair path",
        process.env.KEYPAIR_PATH ?? "./keys/cranker-keypair.json",
      );
      const funderTokenAccount = await askQuestion(
        rl,
        "Funder token account",
      );
      const resolvedFunderTokenAccount = await resolveFunderTokenAccountInput(
        tokenMint,
        funderKeypair,
        funderTokenAccount,
      );
      const amountUi = await askQuestion(
        rl,
        `Amount (${tokenConfig.symbol})`,
        "1",
      );
      const amountBaseUnits = uiAmountToBaseUnits(
        amountUi,
        Number(tokenConfig.decimals ?? 6),
      ).toString();
      output.write(
        `[guided-setup] ${amountUi} ${tokenConfig.symbol} -> ${amountBaseUnits} base units\n`,
      );
      await runCli([
        "withdraw-cranker",
        tokenInput,
        funderKeypair,
        resolvedFunderTokenAccount,
        amountBaseUnits,
      ]);
      return;
    }

    if (choice === "6") {
      output.write("[guided-setup] Epoch close is authorized by the Node after all opaque slots settle or refund.\n");
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
