import { PublicKey } from "@solana/web3.js";

import { getTsnIntentPda, getTsnMotherEscrowPda, sha256Bytes, tsnFetchIntentOnChain } from "@/app/blockchain/solana-tsn";
import { updatePaymentIntentStatus } from "@/app/db/tsn";
import type { PaymentIntentStatus } from "@/app/types/tsn";
import { env } from "@/app/lib/env";

function mapIntentStatus(statusDiscriminant: number): PaymentIntentStatus {
  // Must match programs/trustlink-escrow/src/tsn/state/intent.rs
  // Pending=0, Claimed=1, Executed=2, Settled=3
  if (statusDiscriminant === 1) return "claimed";
  if (statusDiscriminant === 2) return "executed";
  if (statusDiscriminant === 3) return "settled";
  return "pending";
}

export async function syncPaymentIntentFromChain(params: { intentId: string }) {
  if (!env.TSN_ENABLED) return null;
  // Optional gate: can be turned off in prod if needed.
  if (env.TSN_SYNC_ONCHAIN === false) return null;

  const motherEscrow = getTsnMotherEscrowPda();
  const intentSeed32 = sha256Bytes(params.intentId);
  const intentPda: PublicKey = getTsnIntentPda({ motherEscrow, intentSeed32 });

  const onchain = await tsnFetchIntentOnChain({ intent: intentPda });
  if (!onchain) return null;

  const status = mapIntentStatus(onchain.status);
  const leaseExpiryAt = onchain.leaseExpiryTs ? new Date(Number(onchain.leaseExpiryTs) * 1000).toISOString() : null;
  const assignedCrankerPubkey = onchain.assignedCranker?.toBase58() ?? null;
  // On-chain `payout_tx_sig` is the external payout proof bytes, not the Solana
  // transaction signature that submitted proof. Keep the DB proof tx signature
  // written by the Cranker runner instead of replacing it here.
  const proofTxSig = null;

  await updatePaymentIntentStatus({
    id: params.intentId,
    status,
    assignedCrankerPubkey,
    leaseExpiryAt,
    proofTxSig,
  });

  return { status, assignedCrankerPubkey, leaseExpiryAt, proofTxSig };
}
