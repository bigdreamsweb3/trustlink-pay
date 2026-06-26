import { createRequire } from "node:module";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";

const require = createRequire(import.meta.url);
const {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  LAMPORTS_PER_SOL,
  sendAndConfirmTransaction,
} = require("../tsn-sdk/node_modules/@solana/web3.js");
import { resolveSolanaRpcUrl } from "./lib/tsn-rpc.mjs";

const DEFAULT_TSN_PROGRAM_ID = "TSN31jddtsmUg4D5aEdhY31nwB1e53VJJg9X8NoRP8V";
const MOTHER_ESCROW_SEED = Buffer.from("tsn_mother_escrow");
const VERIFIER_SEED = Buffer.from("verifier");

function usage() {
  console.log(`
Usage:
  npm run tsn:verifier:info
  npm run tsn:verifier:fund -- <keypairPath> <amountSol>
  npm run tsn:verifier:fund-cli -- <amountSol>
  npm run tsn:verifier:fund-lamports -- <keypairPath> <lamports>
  npm run tsn:verifier:withdraw -- <authorityKeypairPath> <destinationPubkey> <amountSol>
  npm run tsn:verifier:withdraw-lamports -- <authorityKeypairPath> <destinationPubkey> <lamports>

Environment:
  TSN_PROGRAM_ID or PROGRAM_ID overrides ${DEFAULT_TSN_PROGRAM_ID}
  TSN_RPC_GATEWAY_URL overrides the local TSN RPC gateway URL

Examples:
  npm run tsn:verifier:info
  npm run tsn:verifier:fund -- ~/.config/solana/id.json 0.05
  npm run tsn:verifier:fund-cli -- 0.05
  npm run tsn:verifier:fund-lamports -- ~/.config/solana/id.json 50000000
  npm run tsn:verifier:withdraw -- ~/.config/solana/id.json <destinationPubkey> 0.01
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

function instructionDiscriminator(name) {
  return createHash("sha256").update(`global:${name}`).digest().subarray(0, 8);
}

function encodeU64(value) {
  const buffer = Buffer.alloc(8);
  buffer.writeBigUInt64LE(BigInt(value));
  return buffer;
}

function getContext() {
  const programId = new PublicKey(process.env.TSN_PROGRAM_ID || process.env.PROGRAM_ID || DEFAULT_TSN_PROGRAM_ID);
  const rpcUrl = resolveSolanaRpcUrl({ frontendSafe: false });
  const [motherEscrow] = PublicKey.findProgramAddressSync([MOTHER_ESCROW_SEED], programId);
  const [verifierPda, bump] = PublicKey.findProgramAddressSync([VERIFIER_SEED], programId);
  return {
    programId,
    rpcUrl,
    motherEscrow,
    verifierPda,
    bump,
    connection: new Connection(rpcUrl, "confirmed"),
  };
}

async function printInfo() {
  const { programId, rpcUrl, motherEscrow, verifierPda, bump, connection } = getContext();
  const balanceLamports = await connection.getBalance(verifierPda, "confirmed");
  console.log({
    programId: programId.toBase58(),
    motherEscrow: motherEscrow.toBase58(),
    verifierPda: verifierPda.toBase58(),
    bump,
    rpcUrl,
    balanceLamports,
    balanceSol: balanceLamports / LAMPORTS_PER_SOL,
  });
}

async function fund({ keypairPath, lamports }) {
  const { verifierPda, connection } = getContext();
  const funder = loadKeypair(keypairPath);
  const tx = new Transaction().add(
    SystemProgram.transfer({
      fromPubkey: funder.publicKey,
      toPubkey: verifierPda,
      lamports,
    }),
  );
  const signature = await sendAndConfirmTransaction(connection, tx, [funder], {
    commitment: "confirmed",
  });
  console.log({
    signature,
    funder: funder.publicKey.toBase58(),
    verifierPda: verifierPda.toBase58(),
    lamports,
    sol: lamports / LAMPORTS_PER_SOL,
  });
}

async function fundWithSolanaCli({ amountSol }) {
  const { rpcUrl, verifierPda } = getContext();
  const result = spawnSync(
    "solana",
    [
      "transfer",
      verifierPda.toBase58(),
      String(amountSol),
      "--url",
      rpcUrl,
      "--allow-unfunded-recipient",
    ],
    {
      encoding: "utf8",
      stdio: "pipe",
      shell: process.platform === "win32",
    },
  );

  if (result.status !== 0) {
    throw new Error(
      `solana transfer failed (${result.status}).\n${result.stdout ?? ""}\n${result.stderr ?? ""}`.trim(),
    );
  }

  console.log(result.stdout.trim());
  await printInfo();
}

async function withdraw({ keypairPath, destination, lamports }) {
  const { programId, motherEscrow, verifierPda, connection } = getContext();
  const authority = loadKeypair(keypairPath);
  const destinationPubkey = new PublicKey(destination);
  const tx = new Transaction().add({
    programId,
    keys: [
      { pubkey: authority.publicKey, isSigner: true, isWritable: true },
      { pubkey: motherEscrow, isSigner: false, isWritable: false },
      { pubkey: verifierPda, isSigner: false, isWritable: true },
      { pubkey: destinationPubkey, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: Buffer.concat([
      instructionDiscriminator("tsn_withdraw_verifier_lamports"),
      encodeU64(lamports),
    ]),
  });
  const signature = await sendAndConfirmTransaction(connection, tx, [authority], {
    commitment: "confirmed",
  });
  console.log({
    signature,
    authority: authority.publicKey.toBase58(),
    destination: destinationPubkey.toBase58(),
    verifierPda: verifierPda.toBase58(),
    lamports,
    sol: lamports / LAMPORTS_PER_SOL,
  });
}

const [command, keypairPath, destinationOrAmount, rawAmount] = process.argv.slice(2);

if (!command || command === "--help" || command === "-h") {
  usage();
  process.exit(command ? 0 : 1);
}

if (command === "info") {
  await printInfo();
} else if (command === "fund") {
  if (!keypairPath || !destinationOrAmount) {
    usage();
    process.exit(1);
  }
  const lamports = Math.round(Number(destinationOrAmount) * LAMPORTS_PER_SOL);
  if (!Number.isSafeInteger(lamports) || lamports <= 0) {
    throw new Error("amountSol must be a positive number");
  }
  await fund({ keypairPath, lamports });
} else if (command === "fund-cli") {
  if (!keypairPath) {
    usage();
    process.exit(1);
  }
  const amountSol = Number(keypairPath);
  if (!Number.isFinite(amountSol) || amountSol <= 0) {
    throw new Error("amountSol must be a positive number");
  }
  await fundWithSolanaCli({ amountSol });
} else if (command === "fund-lamports") {
  if (!keypairPath || !destinationOrAmount) {
    usage();
    process.exit(1);
  }
  const lamports = Number(destinationOrAmount);
  if (!Number.isSafeInteger(lamports) || lamports <= 0) {
    throw new Error("lamports must be a positive integer");
  }
  await fund({ keypairPath, lamports });
} else if (command === "withdraw") {
  if (!keypairPath || !destinationOrAmount || !rawAmount) {
    usage();
    process.exit(1);
  }
  const lamports = Math.round(Number(rawAmount) * LAMPORTS_PER_SOL);
  if (!Number.isSafeInteger(lamports) || lamports <= 0) {
    throw new Error("amountSol must be a positive number");
  }
  await withdraw({ keypairPath, destination: destinationOrAmount, lamports });
} else if (command === "withdraw-lamports") {
  if (!keypairPath || !destinationOrAmount || !rawAmount) {
    usage();
    process.exit(1);
  }
  const lamports = Number(rawAmount);
  if (!Number.isSafeInteger(lamports) || lamports <= 0) {
    throw new Error("lamports must be a positive integer");
  }
  await withdraw({ keypairPath, destination: destinationOrAmount, lamports });
} else {
  usage();
  process.exit(1);
}
