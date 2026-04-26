import { PublicKey } from "@solana/web3.js";

import { findUserById } from "@/app/db/users";
import {
  getIdentityBindingState,
  prepareAddRecoveryWalletTransaction,
  prepareRequestRecoveryTransaction,
  prepareSetIdentityFreezeTransaction,
} from "@/app/blockchain/solana";
import type { AuthenticatedUser } from "@/app/types/auth";

export async function getIdentitySecurityForUser(authUser: AuthenticatedUser) {
  const user = await findUserById(authUser.id);
  if (!user) {
    throw new Error("Account not found");
  }

  const binding = await getIdentityBindingState(user.phone_hash);
  return {
    user,
    binding,
  };
}

export async function prepareAddRecoveryWalletForUser(
  authUser: AuthenticatedUser,
  params: { walletAddress: string; allowUpdate?: boolean },
) {
  const { user, binding } = await getIdentitySecurityForUser(authUser);
  if (!binding) {
    throw new Error("Main wallet is not bound yet. Claim a payment first.");
  }

  const nextRecoveryWallet = new PublicKey(params.walletAddress).toBase58();
  if (nextRecoveryWallet === binding.mainWallet) {
    throw new Error("Backup wallet must be different from your main wallet");
  }

  return prepareAddRecoveryWalletTransaction({
    phoneHash: user.phone_hash,
    authorityWallet: binding.mainWallet,
    recoveryWallet: nextRecoveryWallet,
    allowUpdate: params.allowUpdate ?? false,
  });
}

export async function prepareFreezeIdentityForUser(
  authUser: AuthenticatedUser,
  params: { authorityWallet: string; frozen: boolean },
) {
  const { user, binding } = await getIdentitySecurityForUser(authUser);
  if (!binding) {
    throw new Error("Main wallet is not bound yet.");
  }
  if (!binding.recoveryWallet) {
    throw new Error("Add a backup wallet to enable account freeze");
  }

  const authorityWallet = new PublicKey(params.authorityWallet).toBase58();
  if (authorityWallet !== binding.mainWallet && authorityWallet !== binding.recoveryWallet) {
    throw new Error("Only your main wallet or backup wallet can freeze this identity");
  }

  return prepareSetIdentityFreezeTransaction({
    phoneHash: user.phone_hash,
    authorityWallet,
    frozen: params.frozen,
  });
}

export async function prepareRecoveryRequestForUser(
  authUser: AuthenticatedUser,
  params: { authorityWallet: string },
) {
  const { user, binding } = await getIdentitySecurityForUser(authUser);
  if (!binding) {
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
    phoneHash: user.phone_hash,
    authorityWallet,
  });
}
