import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { Keypair, PublicKey } from "@solana/web3.js";
import { tsnFetchMotherEscrowOnChain } from "../tsn-protocol/tsn-sdk/dist/blockchain/solana-tsn.js";
import { tsnConfigurePrivateSettlementOnChain } from "../tsn-protocol/tsn-sdk/dist/private-settlement.js";
import { resolveSolanaRpcUrl } from "./lib/tsn-rpc.mjs";

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
  resolveSolanaRpcUrl({ frontendSafe: false });

const motherEscrow = await tsnFetchMotherEscrowOnChain(rpcUrl);
if (!motherEscrow) {
  throw new Error(`Mother Escrow is not initialized on ${rpcUrl}.`);
}
if (!motherEscrow.valid) {
  throw new Error(
    `Mother Escrow ${motherEscrow.address} is invalid: ${motherEscrow.reason}.`,
  );
}

const suppliedAuthority = authority.publicKey.toBase58();
if (motherEscrow.authority !== suppliedAuthority) {
  throw new Error(
    [
      "Mother Escrow authority mismatch.",
      `On-chain Mother Escrow: ${motherEscrow.address}`,
      `Required authority: ${motherEscrow.authority}`,
      `Supplied keypair: ${suppliedAuthority}`,
      "Use the keypair that initialized Mother Escrow. The program upgrade authority cannot configure private settlement unless it is also the stored Mother Escrow authority.",
    ].join("\n"),
  );
}

const result = await tsnConfigurePrivateSettlementOnChain({
  authority,
  permitSigner,
  enabled: true,
  rpcUrl,
});

console.log({
  programId: process.env.PROGRAM_ID ?? "TSN31jddtsmUg4D5aEdhY31nwB1e53VJJg9X8NoRP8V",
  motherEscrow: motherEscrow.address,
  authority: suppliedAuthority,
  permitSigner: permitSigner.toBase58(),
  config: result.config,
  replayRegistry: result.replayRegistry,
  signature: result.signature,
});
