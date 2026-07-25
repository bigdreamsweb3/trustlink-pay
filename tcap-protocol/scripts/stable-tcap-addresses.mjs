import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PublicKey } from "@solana/web3.js";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scriptDir, "../..");
const config = JSON.parse(
  fs.readFileSync(path.join(root, "protocol-tests/config/stable-tcap.devnet.json"), "utf8")
);

const faucetProgram = new PublicKey(config.faucetProgram);
const [faucetState, faucetStateBump] = PublicKey.findProgramAddressSync(
  [Buffer.from(config.faucetStateSeed, "utf8")],
  faucetProgram
);
const [mintAuthority, mintAuthorityBump] = PublicKey.findProgramAddressSync(
  [Buffer.from(config.faucetMintAuthoritySeed, "utf8")],
  faucetProgram
);

process.stdout.write(`${JSON.stringify({
  network: config.network,
  faucetProgram: faucetProgram.toBase58(),
  stableTcapMint: config.mint,
  faucetState: faucetState.toBase58(),
  faucetStateBump,
  mintAuthority: mintAuthority.toBase58(),
  mintAuthorityBump,
  tokenProgram: config.tokenProgram
}, null, 2)}\n`);
