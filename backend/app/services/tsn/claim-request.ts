import { findPaymentById } from "@/app/db/payments";
import { findReceiverWalletById } from "@/app/db/receiver-wallets";
import { findLatestActiveClaimRequestByPaymentId, findPaymentIntentByPaymentId, createClaimRequest } from "@/app/db/tsn";
import { findUserByPhoneNumber } from "@/app/db/users";
import { getIdentityBindingState } from "@/app/blockchain/solana";
import { verifyClaimProof } from "@/app/lib/privacy-keys";
import { verifyUserActionPin } from "@/app/services/auth";
import { sha256 } from "@/app/utils/hash";
import type { AuthenticatedUser } from "@/app/types/auth";
import { env } from "@/app/lib/env";
import { createTsnIntentForPayment } from "@/app/services/tsn/intent";

function paymentCanStillBeClaimed(status: string) {
  return status === "locked" || status === "expired";
}

function resolveClaimMode(payment: { payment_mode?: string | null }) {
  return payment.payment_mode === "invite" ? "invite" : "secure";
}

export async function requestPaymentClaimViaTsn(params: {
  authUser: AuthenticatedUser;
  paymentId: string;
  pin: string;
  walletAddress?: string;
  receiverWalletId?: string;
  derivedPaymentReceiverPublicKey?: string;
  privacySpendSignature?: string;
  autoclaim: boolean;
}) {
  if (!env.TSN_ENABLED) {
    throw new Error("TSN is not enabled");
  }

  const payment = await findPaymentById(params.paymentId);
  if (!payment) throw new Error("Payment not found");
  if (!paymentCanStillBeClaimed(payment.status)) throw new Error(`Payment is already ${payment.status}`);
  if (payment.receiver_phone !== params.authUser.phoneNumber) {
    throw new Error("Signed-in account does not match payment receiver");
  }

  await verifyUserActionPin(params.authUser, params.pin);

  const phoneHash = sha256(params.authUser.phoneNumber);
  const existingUser = await findUserByPhoneNumber(params.authUser.phoneNumber);
  if (!existingUser || existingUser.id !== params.authUser.id) {
    throw new Error("Receiver must register a TrustLink identity before requesting claim");
  }
  if (!existingUser.phone_identity_pubkey || !existingUser.privacy_spend_pubkey) {
    throw new Error("Receiver must register secure privacy keys before requesting claim");
  }

  const requestedSettlementWalletAddress =
    params.receiverWalletId != null
      ? (await findReceiverWalletById(params.receiverWalletId, existingUser.id))?.wallet_address
      : params.walletAddress ?? existingUser.wallet_address ?? undefined;

  const paymentPhoneIdentityPublicKey = payment.phone_identity_pubkey ?? existingUser.phone_identity_pubkey;
  const bindingPhoneIdentityPublicKey = existingUser.phone_identity_pubkey;
  const paymentMode = resolveClaimMode(payment);
  const binding = await getIdentityBindingState(bindingPhoneIdentityPublicKey);

  if (!requestedSettlementWalletAddress && !binding) {
    throw new Error("Receiver wallet not found");
  }
  const settlementWalletAddress = binding?.settlementWallet ?? requestedSettlementWalletAddress;
  if (!settlementWalletAddress) {
    throw new Error("Receiver wallet not found");
  }
  if (binding && requestedSettlementWalletAddress && binding.settlementWallet !== requestedSettlementWalletAddress) {
    throw new Error(`This TrustLink identity is already bound to ${binding.settlementWallet}`);
  }

  const isSecurePayment = paymentMode === "secure";
  if (isSecurePayment) {
    if (params.derivedPaymentReceiverPublicKey !== payment.payment_receiver_pubkey) {
      throw new Error("Derived receiver key mismatch detected");
    }
    if (!params.privacySpendSignature) {
      throw new Error("Missing privacy ownership proof");
    }
    const proofValid = verifyClaimProof({
      privacySpendPublicKey: existingUser.privacy_spend_pubkey,
      privacySpendSignature: params.privacySpendSignature,
      paymentId: payment.id,
      phoneIdentityPublicKey: paymentPhoneIdentityPublicKey,
      paymentReceiverPublicKey: payment.payment_receiver_pubkey!,
      ephemeralPublicKey: payment.ephemeral_pubkey!,
      settlementWalletPublicKey: settlementWalletAddress,
    });
    if (!proofValid) {
      throw new Error("Privacy ownership proof is invalid");
    }
  }

  const existingIntent = await findPaymentIntentByPaymentId(payment.id);
  const created = existingIntent ? null : await createTsnIntentForPayment(payment);
  const intent = existingIntent ?? ("record" in (created ?? {}) ? (created as any).record : null);
  if (!intent) {
    throw new Error("TSN intent not available for payment");
  }

  const existingClaim = await findLatestActiveClaimRequestByPaymentId(payment.id);
  if (existingClaim && existingClaim.status !== "failed" && existingClaim.status !== "canceled") {
    return {
      paymentId: payment.id,
      intentId: intent.id,
      claimRequestId: existingClaim.id,
      destinationWallet: existingClaim.destination_wallet ?? settlementWalletAddress,
      autoclaim: existingClaim.autoclaim,
      status: existingClaim.status,
    };
  }

  const claimRequest = await createClaimRequest({
    paymentId: payment.id,
    intentId: intent.id,
    recipientHash: payment.receiver_phone_hash,
    destinationWallet: settlementWalletAddress,
    autoclaim: params.autoclaim,
  });

  return {
    paymentId: payment.id,
    intentId: intent.id,
    claimRequestId: claimRequest.id,
    destinationWallet: settlementWalletAddress,
    autoclaim: claimRequest.autoclaim,
    status: claimRequest.status,
  };
}
