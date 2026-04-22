import {
  countReceiverWalletsByUserId,
  createReceiverWallet,
  deleteReceiverWalletById,
  findReceiverWalletByAddress,
  findReceiverWalletByName,
  listReceiverWalletsByUserId,
} from "@/app/db/receiver-wallets";
import {
  findUserByHandle,
  findUserById,
  updateUserProfileIdentity,
} from "@/app/db/users";
import { logger } from "@/app/lib/logger";
import type { AuthenticatedUser } from "@/app/types/auth";
import { sendPhoneVerificationOtp, verifyPhoneOtp } from "@/app/services/phone-verification";

import { sanitizeUser } from "./shared";

export async function addReceiverWalletForUser(
  authUser: AuthenticatedUser,
  params: { walletName: string; walletAddress: string; otp: string },
) {
  const user = await findUserById(authUser.id);

  if (!user) {
    throw new Error("Account not found");
  }

  await verifyPhoneOtp(user.phone_number, params.otp, {
    consume: true,
    purpose: "wallet_add",
  });

  const walletCount = await countReceiverWalletsByUserId(authUser.id);
  if (walletCount >= 3) {
    throw new Error("You can add up to 3 receiver wallets");
  }

  const normalizedWalletName = params.walletName.trim();
  const normalizedWalletAddress = params.walletAddress.trim();

  const existingByName = await findReceiverWalletByName(authUser.id, normalizedWalletName);
  if (existingByName) {
    throw new Error("You already saved a wallet with this name");
  }

  const existingByAddress = await findReceiverWalletByAddress(authUser.id, normalizedWalletAddress);
  if (existingByAddress) {
    throw new Error("This wallet address is already saved");
  }

  const wallet = await createReceiverWallet({
    userId: authUser.id,
    walletName: normalizedWalletName,
    walletAddress: normalizedWalletAddress,
  });

  logger.info("receiver_wallet.create.succeeded", {
    userId: authUser.id,
    walletId: wallet.id,
    walletName: wallet.wallet_name,
  });

  return wallet;
}

export async function startAddReceiverWalletOtp(authUser: AuthenticatedUser, requestIp?: string | null) {
  const user = await findUserById(authUser.id);

  if (!user) {
    throw new Error("Account not found");
  }

  const otp = await sendPhoneVerificationOtp(user.phone_number, "wallet_add", requestIp);

  return {
    phoneNumber: user.phone_number,
    expiresAt: otp.expiresAt,
  };
}

export async function listReceiverWalletsForUser(authUser: AuthenticatedUser) {
  return listReceiverWalletsByUserId(authUser.id);
}

export async function deleteReceiverWalletForUser(authUser: AuthenticatedUser, walletId: string) {
  const deletedWallet = await deleteReceiverWalletById(walletId, authUser.id);

  if (!deletedWallet) {
    throw new Error("Receiver wallet not found");
  }

  logger.info("receiver_wallet.delete.succeeded", {
    userId: authUser.id,
    walletId: deletedWallet.id,
    walletName: deletedWallet.wallet_name,
  });

  return deletedWallet;
}

export async function updateProfileForUser(
  authUser: AuthenticatedUser,
  params: { displayName: string; handle: string },
) {
  const existingByHandle = await findUserByHandle(params.handle);
  if (existingByHandle && existingByHandle.id !== authUser.id) {
    throw new Error("Handle is already taken");
  }

  const updatedUser = await updateUserProfileIdentity({
    userId: authUser.id,
    displayName: params.displayName,
    handle: params.handle,
  });

  logger.info("auth.profile_update.succeeded", {
    userId: updatedUser.id,
    handle: updatedUser.trustlink_handle,
  });

  return sanitizeUser(updatedUser);
}
