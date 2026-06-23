import { Keypair, LAMPORTS_PER_SOL } from "@solana/web3.js";
import nacl from "tweetnacl";
import { createTinsClient } from "../tins-sdk/dist/index.js"; 
import { createSolanaConnection } from "./lib/tsn-rpc.mjs";

async function main() {
  const args = process.argv.slice(2);
  const displayName = args[0] || "Alice Developer";
  const phoneNumber = args[1] || "+1234567890";

  console.log(`Setting up new TIN for '${displayName}' with phone '${phoneNumber}'...`);

  const connection = createSolanaConnection({ frontendSafe: false });
  
  // 1. Generate a brand new random wallet for testing
  const walletKeypair = Keypair.generate();
  console.log(`Generated Wallet Pubkey: ${walletKeypair.publicKey.toBase58()}`);

  // 2. Airdrop SOL so it can pay for transactions
  console.log("Airdropping 1 SOL for transaction fees...");
  const signature = await connection.requestAirdrop(walletKeypair.publicKey, 1 * LAMPORTS_PER_SOL);
  await connection.confirmTransaction(signature, "confirmed");

  // 3. Create a minimal wallet adapter interface required by the SDK
  const mockWallet = {
    publicKey: walletKeypair.publicKey,
    signTransaction: async (tx) => {
      tx.partialSign(walletKeypair);
      return tx;
    },
    signMessage: async (msg) => {
      return nacl.sign.detached(msg, walletKeypair.secretKey);
    }
  };

  // 4. Initialize the TINS SDK client
  const tinsClient = createTinsClient({ connection });

  // 5. Call createTin
  console.log("Calling SDK: tinsClient.createTin()...");
  console.log("Under the hood this will:");
  console.log(" - Hash your wallet pubkey to get an identity seed");
  console.log(" - Derive a Program Derived Address (PDA) for your TinAccount");
  console.log(" - Encrypt your phone number using a derived key");
  console.log(" - Send the CreateTin instruction to the TINS Registrar program");
  
  try {
    const result = await tinsClient.createTin({
      wallet: mockWallet,
      displayName,
      phoneNumber
    });

    console.log("\n✅ TIN Created Successfully!");
    console.log(`Your new TIN is: ${result.tin.toString()}`);
    console.log(`You can now run: npm run tins:lookup ${result.tin.toString()}`);
  } catch (error) {
    console.error("Failed to create TIN:", error);
  }
}

main().catch((err) => {
  console.error("Error:", err);
});
