import "dotenv/config";

import { Keypair } from "@solana/web3.js";

import {
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

  // Note: estimateClaimFee and estimateSenderTransferCost have been deprecated.
  // Payment fee estimation is now handled by TSN (Transfer Settlement Network).
  // For fee calculations, use calculateFeeAmountUi with appropriate BPS settings.

  const amount = 25;
  console.log("sender fee preview (local calculation)");
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

  console.log("claim fee preview (local calculation)");
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
    note: "For on-chain fee estimation, use the TSN SDK evaluateSettlementEconomics.",
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
