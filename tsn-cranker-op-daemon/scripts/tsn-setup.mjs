import { spawn } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { resolve } from "node:path";

const TSN_MOTHER_ESCROW_SEED = Buffer.from("tsn_mother_escrow");
const TSN_CRANKER_SEED = Buffer.from("tsn_cranker");
const TSN_CRANKER_VAULT_SEED = Buffer.from("tsn_cranker_vault");
const TSN_CRANKER_VAULT_AUTHORITY_SEED = Buffer.from("tsn_cranker_vault_authority");
const TSN_CRANKER_VAULT_TOKEN_SEED = Buffer.from("tsn_cranker_vault_token");
const TSN_LIQUIDITY_POSITION_SEED = Buffer.from("tsn_liquidity_position");

const cliPath = resolve(process.cwd(), "../tsn-cranker-sdk/dist/cli.js");
const statePath = resolve(process.cwd(), "operator-state.json");

function resolvePath(path) {
  if (path.startsWith("~/")) return resolve(homedir(), path.slice(2));
  return resolve(process.cwd(), path);
}

function loadEnv() {
  const envPath = resolve(process.cwd(), ".env");
  const env = {};
  if (!existsSync(envPath)) return env;
  const raw = readFileSync(envPath, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separator = trimmed.indexOf("=");
    if (separator <= 0) continue;
    const key = trimmed.slice(0, separator).trim();
    const value = trimmed.slice(separator + 1).trim();
    env[key] = value;
  }
  return env;
}

function loadKeypair(path, Keypair) {
  const raw = JSON.parse(readFileSync(resolvePath(path), "utf8"));
  return Keypair.fromSecretKey(Uint8Array.from(raw));
}

function readState() {
  if (!existsSync(statePath)) {
    return {
      version: 1,
      createdAt: new Date().toISOString(),
      history: [],
      vaults: {},
      liquidityPositions: {},
    };
  }
  return JSON.parse(readFileSync(statePath, "utf8"));
}

function writeState(state) {
  writeFileSync(statePath, JSON.stringify(state, null, 2) + "\n", "utf8");
}

function pushHistory(state, entry) {
  state.history = Array.isArray(state.history) ? state.history : [];
  state.history.push(entry);
  if (state.history.length > 50) {
    state.history = state.history.slice(-50);
  }
}

function deriveContext(env, PublicKey, Keypair) {
  const programId = new PublicKey(env.PROGRAM_ID);
  const operatorKeypair = loadKeypair(env.KEYPAIR_PATH ?? "./keys/cranker-keypair.json", Keypair);
  const operatorPubkey = operatorKeypair.publicKey;
  const [motherEscrow] = PublicKey.findProgramAddressSync([TSN_MOTHER_ESCROW_SEED], programId);
  const [cranker] = PublicKey.findProgramAddressSync(
    [TSN_CRANKER_SEED, motherEscrow.toBuffer(), operatorPubkey.toBuffer()],
    programId,
  );
  return { programId, operatorPubkey, motherEscrow, cranker };
}

function deriveVaults(programId, cranker, tokenMint, funderPubkey, PublicKey) {
  const [crankerVault] = PublicKey.findProgramAddressSync(
    [TSN_CRANKER_VAULT_SEED, cranker.toBuffer(), tokenMint.toBuffer()],
    programId,
  );
  const [vaultAuthority] = PublicKey.findProgramAddressSync(
    [TSN_CRANKER_VAULT_AUTHORITY_SEED, crankerVault.toBuffer()],
    programId,
  );
  const [vaultTokenAccount] = PublicKey.findProgramAddressSync(
    [TSN_CRANKER_VAULT_TOKEN_SEED, crankerVault.toBuffer()],
    programId,
  );
  const [liquidityPosition] = PublicKey.findProgramAddressSync(
    [TSN_LIQUIDITY_POSITION_SEED, crankerVault.toBuffer(), funderPubkey.toBuffer()],
    programId,
  );
  return { crankerVault, vaultAuthority, vaultTokenAccount, liquidityPosition };
}

async function updateOperatorState(args) {
  const command = args[0];
  const env = loadEnv();
  if (!env.PROGRAM_ID || !env.KEYPAIR_PATH) return;

  let solana;
  try {
    solana = await import("@solana/web3.js");
  } catch {
    console.warn("[operator-state] skipped local state update because @solana/web3.js is not installed yet");
    return;
  }
  const { PublicKey, Keypair } = solana;

  const state = readState();
  const { programId, operatorPubkey, motherEscrow, cranker } = deriveContext(env, PublicKey, Keypair);
  const now = new Date().toISOString();

  state.updatedAt = now;
  state.rpcUrl = env.RPC_URL ?? null;
  state.programId = programId.toBase58();
  state.keypairPath = env.KEYPAIR_PATH;
  state.operatorPubkey = operatorPubkey.toBase58();
  state.motherEscrow = motherEscrow.toBase58();
  state.cranker = cranker.toBase58();

  if (command === "register-cranker") {
    state.registeredAt = state.registeredAt ?? now;
    pushHistory(state, { at: now, command, cranker: state.cranker });
  }

  if (command === "set-funding-policy") {
    state.allowExternalFunding = args[1] === "true";
    pushHistory(state, { at: now, command, allowExternalFunding: state.allowExternalFunding });
  }

  if (command === "init-vault" && args[1]) {
    const tokenMint = new PublicKey(args[1]);
    const { crankerVault, vaultAuthority, vaultTokenAccount } = deriveVaults(
      programId,
      cranker,
      tokenMint,
      operatorPubkey,
      PublicKey,
    );
    state.vaults[tokenMint.toBase58()] = {
      tokenMint: tokenMint.toBase58(),
      crankerVault: crankerVault.toBase58(),
      vaultAuthority: vaultAuthority.toBase58(),
      vaultTokenAccount: vaultTokenAccount.toBase58(),
      initializedAt: now,
      allowExternalFunding: state.allowExternalFunding ?? null,
    };
    pushHistory(state, { at: now, command, tokenMint: tokenMint.toBase58() });
  }

  if ((command === "fund-cranker" || command === "withdraw-cranker") && args[1] && args[2] && args[3] && args[4]) {
    const tokenMint = new PublicKey(args[1]);
    const funderKeypair = loadKeypair(args[2], Keypair);
    const funderPubkey = funderKeypair.publicKey;
    const { crankerVault, vaultAuthority, vaultTokenAccount, liquidityPosition } = deriveVaults(
      programId,
      cranker,
      tokenMint,
      funderPubkey,
      PublicKey,
    );
    const vaultKey = tokenMint.toBase58();
    state.vaults[vaultKey] = {
      ...(state.vaults[vaultKey] ?? {}),
      tokenMint: tokenMint.toBase58(),
      crankerVault: crankerVault.toBase58(),
      vaultAuthority: vaultAuthority.toBase58(),
      vaultTokenAccount: vaultTokenAccount.toBase58(),
    };
    const positionKey = `${vaultKey}:${funderPubkey.toBase58()}`;
    const position = state.liquidityPositions[positionKey] ?? {
      tokenMint: tokenMint.toBase58(),
      funderPubkey: funderPubkey.toBase58(),
      funderTokenAccount: args[3],
      liquidityPosition: liquidityPosition.toBase58(),
      netBaseUnits: "0",
    };
    const current = BigInt(position.netBaseUnits ?? "0");
    const amount = BigInt(args[4]);
    const next = command === "fund-cranker" ? current + amount : current - amount;
    state.liquidityPositions[positionKey] = {
      ...position,
      funderTokenAccount: args[3],
      netBaseUnits: next.toString(),
      updatedAt: now,
      lastAction: command,
      lastAmountBaseUnits: amount.toString(),
    };
    pushHistory(state, {
      at: now,
      command,
      tokenMint: tokenMint.toBase58(),
      funderPubkey: funderPubkey.toBase58(),
      amountBaseUnits: amount.toString(),
      liquidityPosition: liquidityPosition.toBase58(),
    });
  }

  if (command === "settle-epoch") {
    state.lastSettlement = {
      at: now,
      force: args[1] === "--force",
    };
    pushHistory(state, { at: now, command, force: args[1] === "--force" });
  }

  writeState(state);
  console.log(`[operator-state] updated ${statePath}`);
}

const args = process.argv.slice(2);
const child = spawn(process.execPath, [cliPath, ...args], {
  stdio: "inherit",
});

child.on("exit", (code) => {
  if (code === 0) {
    updateOperatorState(args).catch((error) => {
      console.warn("[operator-state] failed to update local state", error);
    });
  }
  process.exit(code ?? 0);
});
