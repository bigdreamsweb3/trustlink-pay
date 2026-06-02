import { createRequire } from "node:module";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { resolve } from "node:path";

const require = createRequire(import.meta.url);
const {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountInstruction,
  getAssociatedTokenAddressSync,
} = require("../tsn-sdk/node_modules/@solana/spl-token");
const {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  LAMPORTS_PER_SOL,
  sendAndConfirmTransaction,
} = require("../tsn-sdk/node_modules/@solana/web3.js");

const DEFAULT_TSN_PROGRAM_ID = "TSN31jddtsmUg4D5aEdhY31nwB1e53VJJg9X8NoRP8V";
const DEFAULT_TOKEN_MINT = "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU";
const TREASURY_SEED = Buffer.from("tsn_treasury");

function usage() {
  console.log(`
Usage:
  npm run tsn:treasury:info
  npm run tsn:treasury:info -- <tokenMint>
  npm run tsn:treasury:ata -- <payerKeypairPath> [tokenMint]

Environment:
  TSN_PROGRAM_ID or PROGRAM_ID overrides ${DEFAULT_TSN_PROGRAM_ID}
  SOLANA_RPC_URL or RPC_URL overrides https://api.devnet.solana.com
  TSN_TOKEN_MINT overrides ${DEFAULT_TOKEN_MINT}

Examples:
  npm run tsn:treasury:info
  npm run tsn:treasury:ata -- C:\\Users\\codepara\\.config\\solana\\id.json
  npm run tsn:treasury:ata -- ~/.config/solana/id.json
`);
}

function resolvePath(path) {
  if (process.platform !== "win32") {
    const windowsPath = path.match(/^([A-Za-z]):[\\/]Users[\\/]([^\\/]+)[\\/](.+)$/);
    if (windowsPath) {
      const [, drive, user, rest] = windowsPath;
      return `/mnt/${drive.toLowerCase()}/Users/${user}/${rest.replaceAll("\\", "/")}`;
    }

    const unquotedWindowsPath = path.match(/^([A-Za-z]):Users([^.]*)\.configsolana(.+)$/);
    if (unquotedWindowsPath) {
      const [, drive, user, file] = unquotedWindowsPath;
      return `/mnt/${drive.toLowerCase()}/Users/${user}/.config/solana/${file}`;
    }
  }

  if (path.startsWith("~/")) return resolve(homedir(), path.slice(2));
  return resolve(process.cwd(), path);
}

function loadKeypair(path) {
  let resolvedPath = resolvePath(path);
  if (!existsSync(resolvedPath)) {
    const wslDefaultKeypair = resolve(homedir(), ".config/solana/id.json");
    if (process.platform !== "win32" && existsSync(wslDefaultKeypair)) {
      console.warn(
        `Keypair file not found at ${resolvedPath}; using WSL Solana default ${wslDefaultKeypair}.`,
      );
      resolvedPath = wslDefaultKeypair;
    } else {
      throw new Error(
        `Keypair file not found: ${resolvedPath}. If this keypair is inside WSL, run this npm command from WSL or pass a Windows-accessible keypair path.`,
      );
    }
  }
  const parsed = JSON.parse(readFileSync(resolvedPath, "utf8"));
  return Keypair.fromSecretKey(Uint8Array.from(parsed));
}

function getContext(rawTokenMint) {
  const programId = new PublicKey(process.env.TSN_PROGRAM_ID || process.env.PROGRAM_ID || DEFAULT_TSN_PROGRAM_ID);
  const rpcUrl = process.env.SOLANA_RPC_URL || process.env.RPC_URL || "https://api.devnet.solana.com";
  const tokenMint = new PublicKey(rawTokenMint || process.env.TSN_TOKEN_MINT || DEFAULT_TOKEN_MINT);
  const [treasuryPda, bump] = PublicKey.findProgramAddressSync([TREASURY_SEED], programId);
  const treasuryTokenAccount = getAssociatedTokenAddressSync(
    tokenMint,
    treasuryPda,
    true,
    TOKEN_PROGRAM_ID,
    ASSOCIATED_TOKEN_PROGRAM_ID,
  );
  return {
    programId,
    rpcUrl,
    tokenMint,
    treasuryPda,
    treasuryTokenAccount,
    bump,
    connection: new Connection(rpcUrl, "confirmed"),
  };
}

async function printInfo(rawTokenMint) {
  const { programId, rpcUrl, tokenMint, treasuryPda, treasuryTokenAccount, bump, connection } = getContext(rawTokenMint);
  let balanceLamports = null;
  let tokenAccountInfo = null;
  let rpcError = null;
  try {
    balanceLamports = await connection.getBalance(treasuryPda, "confirmed");
    tokenAccountInfo = await connection.getAccountInfo(treasuryTokenAccount, "confirmed");
  } catch (error) {
    rpcError = error instanceof Error ? error.message : "Unknown RPC error";
  }
  let tokenBalance = null;
  if (tokenAccountInfo && !rpcError) {
    tokenBalance = await connection.getTokenAccountBalance(treasuryTokenAccount, "confirmed");
  }

  console.log({
    programId: programId.toBase58(),
    treasuryPda: treasuryPda.toBase58(),
    bump,
    rpcUrl,
    balanceLamports,
    balanceSol: balanceLamports == null ? null : balanceLamports / LAMPORTS_PER_SOL,
    tokenMint: tokenMint.toBase58(),
    treasuryTokenAccount: treasuryTokenAccount.toBase58(),
    treasuryTokenAccountExists: Boolean(tokenAccountInfo),
    tokenBalance: tokenBalance?.value ?? null,
    rpcError,
    env: `TSN_TREASURY_OWNER=${treasuryPda.toBase58()}`,
  });
}

async function initAta({ keypairPath, rawTokenMint }) {
  const { tokenMint, treasuryPda, treasuryTokenAccount, connection } = getContext(rawTokenMint);
  const payer = loadKeypair(keypairPath);
  const existing = await connection.getAccountInfo(treasuryTokenAccount, "confirmed");
  if (existing) {
    console.log({
      status: "already_exists",
      treasuryPda: treasuryPda.toBase58(),
      treasuryTokenAccount: treasuryTokenAccount.toBase58(),
      tokenMint: tokenMint.toBase58(),
    });
    return;
  }

  const tx = new Transaction().add(
    createAssociatedTokenAccountInstruction(
      payer.publicKey,
      treasuryTokenAccount,
      treasuryPda,
      tokenMint,
      TOKEN_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID,
    ),
  );
  const signature = await sendAndConfirmTransaction(connection, tx, [payer], {
    commitment: "confirmed",
  });
  console.log({
    status: "created",
    signature,
    payer: payer.publicKey.toBase58(),
    treasuryPda: treasuryPda.toBase58(),
    treasuryTokenAccount: treasuryTokenAccount.toBase58(),
    tokenMint: tokenMint.toBase58(),
  });
}

let args = process.argv.slice(2);

// Skip the "--" separator if present
if (args.length > 0 && args[0] === "--") {
  args = args.slice(1);
}

const [command, firstArg, secondArg] = args;

if (!command || command === "--help" || command === "-h") {
  usage();
  process.exit(command ? 0 : 1);
}

if (command === "info") {
  await printInfo(firstArg);
} else if (command === "init-ata") {
  if (!firstArg) {
    usage();
    process.exit(1);
  }
  await initAta({ keypairPath: firstArg, rawTokenMint: secondArg });
} else {
  usage();
  process.exit(1);
}
