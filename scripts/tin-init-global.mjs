import { createRequire } from "node:module";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { resolve } from "node:path";

const require = createRequire(import.meta.url);
const {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
  sendAndConfirmTransaction,
} = require("../backend/node_modules/@solana/web3.js");
import { resolveSolanaRpcUrl } from "./lib/tsn-rpc.mjs";

const DEFAULT_PROGRAM_ID = "TinseNnU588NkmRZBe4ADJbxqrqQma92678UFP6VuwT";
const DEFAULT_STARTING_SEQUENCE = "100000000";

function usage() {
  console.log(`
Usage:
  npm run tin:init-global -- [programId] [payerKeypairPath] [startingSequence]

Defaults:
  programId          ${DEFAULT_PROGRAM_ID}
  payerKeypairPath   ~/.config/solana/id.json
  startingSequence   ${DEFAULT_STARTING_SEQUENCE}

Examples:
  npm run tin:init-global
  npm run tin:init-global -- TinseNnU588NkmRZBe4ADJbxqrqQma92678UFP6VuwT ~/.config/solana/id.json ${DEFAULT_STARTING_SEQUENCE}

Environment:
  TSN_RPC_GATEWAY_URL can override the local TSN RPC gateway URL.
`);
}

function expandPath(pathValue) {
  if (!pathValue || pathValue === "~") return homedir();
  if (pathValue.startsWith("~/") || pathValue.startsWith("~\\")) {
    return resolve(homedir(), pathValue.slice(2));
  }
  return resolve(pathValue);
}

function readKeypair(pathValue) {
  const keypairPath = expandPath(pathValue);
  if (!existsSync(keypairPath)) {
    throw new Error(`Keypair not found: ${keypairPath}`);
  }
  const secret = JSON.parse(readFileSync(keypairPath, "utf8"));
  return {
    keypair: Keypair.fromSecretKey(Uint8Array.from(secret)),
    keypairPath,
  };
}

function encodeInitializeProgram(startingSequence) {
  const data = Buffer.alloc(1 + 8);
  data.writeUInt8(0, 0);
  data.writeBigUInt64LE(BigInt(startingSequence), 1);
  return data;
}

async function main() {
  const [, , maybeProgramId, maybeKeypairPath, maybeStartingSequence] = process.argv;
  if (maybeProgramId === "--help" || maybeProgramId === "-h") {
    usage();
    return;
  }

  const programId = new PublicKey(maybeProgramId || process.env.TINS_PROGRAM_ID || DEFAULT_PROGRAM_ID);
  const payerPath = maybeKeypairPath || process.env.TINS_AUTHORITY_KEYPAIR_PATH || "~/.config/solana/id.json";
  const startingSequence = BigInt(maybeStartingSequence || process.env.TINS_STARTING_SEQUENCE || DEFAULT_STARTING_SEQUENCE);
  const rpcUrl = resolveSolanaRpcUrl({ frontendSafe: false });
  const { keypair: payer, keypairPath } = readKeypair(payerPath);
  const connection = new Connection(rpcUrl, "confirmed");
  const [globalState] = PublicKey.findProgramAddressSync([Buffer.from("global-state")], programId);

  const existing = await connection.getAccountInfo(globalState, "confirmed");
  if (existing) {
    console.log(JSON.stringify({
      mode: rpcUrl.includes("devnet") ? "devnet" : "custom",
      status: "already_initialized",
      programId: programId.toBase58(),
      globalState: globalState.toBase58(),
      payer: payer.publicKey.toBase58(),
    }, null, 2));
    return;
  }

  const instruction = new TransactionInstruction({
    programId,
    keys: [
      { pubkey: payer.publicKey, isSigner: true, isWritable: true },
      { pubkey: globalState, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: encodeInitializeProgram(startingSequence),
  });
  const transaction = new Transaction().add(instruction);
  const signature = await sendAndConfirmTransaction(connection, transaction, [payer], {
    commitment: "confirmed",
  });

  console.log(JSON.stringify({
    mode: rpcUrl.includes("devnet") ? "devnet" : "custom",
    status: "initialized",
    signature,
    programId: programId.toBase58(),
    globalState: globalState.toBase58(),
    payer: payer.publicKey.toBase58(),
    payerKeypairPath: keypairPath,
    startingSequence: startingSequence.toString(),
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
