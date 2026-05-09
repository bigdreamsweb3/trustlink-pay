export type PaymentIntentStatus = "pending" | "claimed" | "executed" | "settled" | "expired";
export type ClaimRequestStatus = "pending" | "processing" | "completed" | "canceled" | "failed";

export interface PaymentIntentRecord {
  id: string;
  payment_id: string;
  intent_seed_hash: string;
  recipient_hash: string;
  token_mint_address: string | null;
  amount: string;
  status: PaymentIntentStatus;
  assigned_cranker_pubkey: string | null;
  lease_expiry_at: string | null;
  claim_tx_sig: string | null;
  proof_tx_sig: string | null;
  created_at: string;
}

export interface ClaimRequestRecord {
  id: string;
  payment_id: string;
  intent_id: string;
  recipient_hash: string;
  destination_wallet: string | null;
  autoclaim: boolean;
  status: ClaimRequestStatus;
  requested_at: string;
  updated_at: string;
}
