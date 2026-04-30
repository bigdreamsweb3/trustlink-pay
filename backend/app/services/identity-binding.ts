import { PublicKey } from "@solana/web3.js";

import { findUserById, updateUserPublicKeyMaterial } from "@/app/db/users";
import { markPaymentsReceiverOnboarded } from "@/app/db/payments";
import {
  getIdentityBindingState,
  prepareAddRecoveryWalletTransaction,
  prepareRequestRecoveryTransaction,
  prepareSetIdentityFreezeTransaction,
} from "@/app/blockchain/solana";
import type { AuthenticatedUser } from "@/app/types/auth";
import { hashBindingSignaturePayload } from "@/app/lib/privacy-keys";
import { AutoclaimEngine } from "@/app/services/payments/autoclaim-engine";

export async function getIdentitySecurityForUser(authUser: AuthenticatedUser) {
  const user = await findUserById(authUser.id);
  if (!user) {
    throw new Error("Account not found");
  }

  if (!user.phone_identity_pubkey) {
    return {
      user,
      phoneIdentity: null,
      privacy: null,
      binding: null,
    };
  }

  const binding = await getIdentityBindingState(user.phone_identity_pubkey);
  return {
    user,
    phoneIdentity: { publicKey: user.phone_identity_pubkey },
    privacy:
      user.privacy_view_pubkey && user.privacy_spend_pubkey
        ? {
            viewPublicKey: user.privacy_view_pubkey,
            spendPublicKey: user.privacy_spend_pubkey,
          }
        : null,
    binding,
  };
}

export async function registerIdentityKeysForUser(
  authUser: AuthenticatedUser,
  params: {
    phoneIdentityPublicKey: string;
    privacyViewPublicKey: string;
    privacySpendPublicKey: string;
    settlementWalletPublicKey: string;
    recoveryWalletPublicKey?: string | null;
    bindingSignature?: string | null;
  }
) {
  const user = await findUserById(authUser.id);
  if (!user) {
    throw new Error("Account not found");
  }

  const settlementWalletPublicKey = new PublicKey(params.settlementWalletPublicKey).toBase58();
  const recoveryWalletPublicKey = params.recoveryWalletPublicKey
    ? new PublicKey(params.recoveryWalletPublicKey).toBase58()
    : null;

  const bindingSignature =
    params.bindingSignature ??
    hashBindingSignaturePayload({
      phoneIdentityPublicKey: params.phoneIdentityPublicKey,
      privacyViewPublicKey: params.privacyViewPublicKey,
      privacySpendPublicKey: params.privacySpendPublicKey,
      settlementWalletPublicKey,
      recoveryWalletPublicKey,
    });

  const updated = await updateUserPublicKeyMaterial({
    userId: authUser.id,
    phoneIdentityPublicKey: new PublicKey(params.phoneIdentityPublicKey).toBase58(),
    privacyViewPublicKey: params.privacyViewPublicKey,
    privacySpendPublicKey: new PublicKey(params.privacySpendPublicKey).toBase58(),
    settlementWalletPublicKey,
    recoveryWalletPublicKey,
    bindingSignature,
  });

  await markPaymentsReceiverOnboarded({
    receiverPhone: authUser.phoneNumber,
    receiverWallet: settlementWalletPublicKey,
  });
  await AutoclaimEngine.triggerReceiverOnboarded({
    receiverPhone: authUser.phoneNumber,
    triggerSource: "receiver.onboarded",
  });

  return {
    phoneIdentityPublicKey: updated.phone_identity_pubkey,
    privacyViewPublicKey: updated.privacy_view_pubkey,
    privacySpendPublicKey: updated.privacy_spend_pubkey,
    settlementWalletPublicKey: updated.settlement_wallet_pubkey,
    recoveryWalletPublicKey: updated.recovery_wallet_pubkey,
    bindingSignature: updated.binding_signature,
  };
}

export async function prepareAddRecoveryWalletForUser(
  authUser: AuthenticatedUser,
  params: { walletAddress: string; allowUpdate?: boolean },
) {
  const { user, phoneIdentity, binding } = await getIdentitySecurityForUser(authUser);
  if (!binding || !phoneIdentity) {
    throw new Error("Main wallet is not bound yet. Claim a payment first.");
  }

  const nextRecoveryWallet = new PublicKey(params.walletAddress).toBase58();
  if (nextRecoveryWallet === binding.settlementWallet) {
    throw new Error("Backup wallet must be different from your main wallet");
  }

  return prepareAddRecoveryWalletTransaction({
    identityPublicKey: phoneIdentity.publicKey,
    authorityWallet: binding.settlementWallet,
    recoveryWallet: nextRecoveryWallet,
    allowUpdate: params.allowUpdate ?? false,
  });
}

export async function prepareFreezeIdentityForUser(
  authUser: AuthenticatedUser,
  params: { authorityWallet: string; frozen: boolean },
) {
  const { phoneIdentity, binding } = await getIdentitySecurityForUser(authUser);
  if (!binding || !phoneIdentity) {
    throw new Error("Main wallet is not bound yet.");
  }
  if (!binding.recoveryWallet) {
    throw new Error("Add a backup wallet to enable account freeze");
  }

  const authorityWallet = new PublicKey(params.authorityWallet).toBase58();
  if (authorityWallet !== binding.settlementWallet && authorityWallet !== binding.recoveryWallet) {
    throw new Error("Only your main wallet or backup wallet can freeze this identity");
  }

  return prepareSetIdentityFreezeTransaction({
    identityPublicKey: phoneIdentity.publicKey,
    authorityWallet,
    frozen: params.frozen,
  });
}

export async function prepareRecoveryRequestForUser(
  authUser: AuthenticatedUser,
  params: { authorityWallet: string },
) {
  const { phoneIdentity, binding } = await getIdentitySecurityForUser(authUser);
  if (!binding || !phoneIdentity) {
    throw new Error("Main wallet is not bound yet.");
  }
  if (!binding.recoveryWallet) {
    throw new Error("Add a backup wallet to enable recovery");
  }

  const authorityWallet = new PublicKey(params.authorityWallet).toBase58();
  if (authorityWallet !== binding.recoveryWallet) {
    throw new Error("Recovery must be started from your backup wallet");
  }

  return prepareRequestRecoveryTransaction({
    identityPublicKey: phoneIdentity.publicKey,
    authorityWallet,
  });
}
