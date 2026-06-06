import { Connection, Keypair, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { createTinsClient } from "../tins-sdk/src/index.js"; 
// Note: We might need to run this with tsx if the SDK is in typescript, 
// or compile it, but let's assume it works or we'll adjust the import.
// Actually, since it's a monorepo, let's use the local SDK directly.
import * as TinsSdk from "../tins-sdk/src/index.ts"; // Will need a ts-node or tsx runner

async function main() {
  const args = process.argv.slice(2);
  const displayName = args[0] || "Alice Developer";
  const phoneNumber = args[1] || "+1234567890";

  console.log(`Setting up new TIN for '${displayName}' with phone '${phoneNumber}'...`);

  const connection = new Connection("http://127.0.0.1:8899", "confirmed");
  
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
      import("tweetnacl").then((nacl) => {
          // just for nodejs fallback if tweetnacl is needed
      });
      // A quick hack for signMessage in node without tweetnacl directly imported:
      // We will just use the standard solana/web3.js nacl 
      const nacl = await import("tweetnacl");
      return nacl.default.sign.detached(msg, walletKeypair.secretKey);
    }
  };

  // 4. Initialize the TINS SDK client
  const tinsClient = TinsSdk.createTinsClient({ connection });

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
    console.log(`You can now run: npm run test:lookup ${result.tin.toString()}`);
  } catch (error) {
    console.error("Failed to create TIN:", error);
  }
}

main().catch((err) => {
  console.error("Error:", err);
});
