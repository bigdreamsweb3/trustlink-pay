import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { Keypair, PublicKey } from "@solana/web3.js";
import { tsnConfigurePrivateSettlementOnChain } from "../tsn-sdk/dist/private-settlement.js";

const [authorityPath, permitSignerAddress, rpcUrlArg] = process.argv.slice(2);
if (!authorityPath || !permitSignerAddress) {
  throw new Error(
    "Usage: npm run tsn:private:configure -- <authority-keypair.json> <permit-signer-pubkey> [rpc-url]",
  );
}

const authority = Keypair.fromSecretKey(
  Uint8Array.from(JSON.parse(readFileSync(resolve(authorityPath), "utf8"))),
);
const permitSigner = new PublicKey(permitSignerAddress);
const rpcUrl =
  rpcUrlArg ||
  process.env.RPC_URL ||
  process.env.SOLANA_RPC_URL ||
  "https://api.devnet.solana.com";

const result = await tsnConfigurePrivateSettlementOnChain({
  authority,
  permitSigner,
  enabled: true,
  rpcUrl,
});

console.log({
  programId: process.env.PROGRAM_ID ?? "TSN31jddtsmUg4D5aEdhY31nwB1e53VJJg9X8NoRP8V",
  authority: authority.publicKey.toBase58(),
  permitSigner: permitSigner.toBase58(),
  config: result.config,
  signature: result.signature,
});
