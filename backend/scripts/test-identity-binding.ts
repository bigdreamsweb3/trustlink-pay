import "dotenv/config";

import { Keypair } from "@solana/web3.js";

import {
  estimateClaimFee,
  estimateSenderTransferCost,
  prepareInitializeIdentityBindingTransaction,
} from "@/app/blockchain/solana";

async function main() {
  const identity = Keypair.generate().publicKey.toBase58();
  const settlementWallet = Keypair.generate().publicKey.toBase58();
  const tokenMintAddress = JSON.parse(process.env.SOLANA_ALLOWED_SPL_TOKENS ?? "[]")?.[0]?.mintAddress;

  if (!tokenMintAddress) {
    throw new Error("SOLANA_ALLOWED_SPL_TOKENS must include at least one token mint for this test");
  }

  const binding = await prepareInitializeIdentityBindingTransaction({
    identityPublicKey: identity,
    settlementWallet,
  });

  console.log("identity binding preview");
  console.log({
    identity,
    settlementWallet,
    identityBinding: binding.identityBinding,
    feePayer: binding.feePayer,
    estimatedNetworkFeeLamports: binding.estimatedNetworkFeeLamports,
    estimatedNetworkFeeSol: binding.estimatedNetworkFeeSol,
    programId: binding.programId,
  });

  const senderFee = await estimateSenderTransferCost({
    paymentId: crypto.randomUUID(),
    senderWallet: settlementWallet,
    phoneIdentityPublicKey: identity,
    paymentReceiverPublicKey: Keypair.generate().publicKey.toBase58(),
    paymentMode: "secure",
    amount: 25,
    tokenMintAddress,
    expiryUnixSeconds: Math.floor(Date.now() / 1000) + 3600,
  });

  console.log("sender fee preview");
  console.log(senderFee);

  const claimFee = await estimateClaimFee({
    paymentId: crypto.randomUUID(),
    escrowAccount: Keypair.generate().publicKey.toBase58(),
    escrowVaultAddress: Keypair.generate().publicKey.toBase58(),
    receiverWallet: settlementWallet,
    paymentPhoneIdentityPublicKey: identity,
    bindingPhoneIdentityPublicKey: identity,
    paymentReceiverPublicKey: Keypair.generate().publicKey.toBase58(),
    paymentMode: "secure",
    tokenMintAddress,
    amount: 25,
  });

  console.log("claim fee preview");
  console.log(claimFee);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
