import "dotenv/config";

import { Keypair } from "@solana/web3.js";

import {
  estimateClaimFee,
  estimateSenderTransferCost,
  prepareInitializeIdentityBindingTransaction,
} from "@/app/blockchain/solana";
import { calculateFeeAmountUi } from "@/app/blockchain/solana-core";

async function main() {
  const identity = Keypair.generate().publicKey.toBase58();
  const settlementWallet = Keypair.generate().publicKey.toBase58();
  const allowedTokens = JSON.parse(process.env.SOLANA_ALLOWED_SPL_TOKENS ?? "[]") as Array<{
    mintAddress?: string;
    decimals?: number;
  }>;
  const tokenMintAddress = allowedTokens[0]?.mintAddress;
  const tokenDecimals = Number.isFinite(allowedTokens[0]?.decimals)
    ? Number(allowedTokens[0]?.decimals)
    : 6;

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

  if (!tokenMintAddress) {
    const amount = 25;
    console.log("sender fee preview");
    console.log({
      mode: "local-fee-math",
      amount,
      decimals: tokenDecimals,
      senderFeeAmountUi: calculateFeeAmountUi({
        amount,
        decimals: tokenDecimals,
        basisPoints: Number(process.env.TRUSTLINK_SEND_FEE_BPS ?? "0"),
        maxUiAmount: Number(process.env.TRUSTLINK_SEND_FEE_MAX_UI_AMOUNT ?? "0"),
      }),
    });

    console.log("claim fee preview");
    console.log({
      mode: "local-fee-math",
      amount,
      decimals: tokenDecimals,
      claimFeeAmountUi: calculateFeeAmountUi({
        amount,
        decimals: tokenDecimals,
        basisPoints: Number(process.env.TRUSTLINK_CLAIM_FEE_BPS ?? "0"),
        maxUiAmount: Number(process.env.TRUSTLINK_CLAIM_FEE_MAX_UI_AMOUNT ?? "0"),
      }),
      note: "Set SOLANA_ALLOWED_SPL_TOKENS to run full on-chain payment fee estimation.",
    });
    return;
  }

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
