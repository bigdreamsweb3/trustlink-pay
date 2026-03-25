import {
  findUserById,
  findUserByHandle,
  findUserByPhoneNumber,
  updateUserProfileIdentity,
  updateUserPin,
  upsertUserProfile,
} from "@/app/db/users";
import {
  countReceiverWalletsByUserId,
  createReceiverWallet,
  listReceiverWalletsByUserId,
} from "@/app/db/receiver-wallets";
import {
  issueAccessToken,
  issueAuthChallengeToken,
  requireAuthChallengeToken,
} from "@/app/lib/auth";
import { logger } from "@/app/lib/logger";
import type { AuthenticatedUser } from "@/app/types/auth";
import { sha256 } from "@/app/utils/hash";
import { hashPassword, verifyPassword } from "@/app/utils/password";
import {
  verifyPhoneOtp,
  sendPhoneVerificationOtp,
} from "@/app/services/phone-verification";
import { sendWelcomeMessage } from "@/app/services/whatsapp";

export async function registerUser(params: {
  phoneNumber: string;
  otp: string;
  displayName: string;
  handle: string;
  walletAddress?: string;
}) {
  const existingByHandle = await findUserByHandle(params.handle);
  const existingByPhone = await findUserByPhoneNumber(params.phoneNumber);

  if (existingByPhone) {
    throw new Error("Phone number is already registered");
  }

  if (existingByHandle) {
    throw new Error("Handle is already taken");
  }

  await verifyPhoneOtp(params.phoneNumber, params.otp, {
    consume: true,
    purpose: "register",
  });

  const user = await upsertUserProfile({
    phoneNumber: params.phoneNumber,
    phoneHash: sha256(params.phoneNumber),
    displayName: params.displayName,
    handle: params.handle,
    pinHash: "",
    walletAddress: params.walletAddress,
  });

  try {
    await sendWelcomeMessage(
      params.phoneNumber,
      params.displayName,
      params.handle,
    );
  } catch (error) {
    logger.warn("auth.register.welcome_message_failed", {
      phoneNumber: params.phoneNumber,
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }

  logger.info("auth.register.succeeded", {
    userId: user.id,
    phoneNumber: user.phone_number,
    handle: user.trustlink_handle,
  });

  return {
    challengeToken: issueAuthChallengeToken({
      id: user.id,
      phoneNumber: user.phone_number,
      stage: "pin_setup",
    }),
    user: sanitizeUser(user),
  };
}

export async function loginUser(params: {
  phoneNumber: string;
  otp: string;
}) {
  const user = await findUserByPhoneNumber(params.phoneNumber);

  if (!user) {
    throw new Error("Account not found");
  }

  await verifyPhoneOtp(params.phoneNumber, params.otp, {
    consume: true,
    purpose: "login",
  });

  logger.info("auth.login.succeeded", {
    userId: user.id,
    phoneNumber: user.phone_number,
  });

  return {
    challengeToken: issueAuthChallengeToken({
      id: user.id,
      phoneNumber: user.phone_number,
      stage: user.pin_hash ? "pin_verify" : "pin_setup",
    }),
    user: sanitizeUser(user),
    pinRequired: Boolean(user.pin_hash),
    pinSetupRequired: !user.pin_hash,
  };
}

export async function setupUserPin(params: { challengeToken: string; pin: string }) {
  const challenge = requireAuthChallengeToken(params.challengeToken, "pin_setup");
  const user = await findUserById(challenge.sub);

  if (!user) {
    throw new Error("Account not found");
  }

  const updatedUser = await updateUserPin({
    userId: user.id,
    pinHash: await hashPassword(params.pin),
  });

  logger.info("auth.pin_setup.succeeded", {
    userId: updatedUser.id,
    phoneNumber: updatedUser.phone_number,
  });

  return {
    accessToken: issueAccessToken({
      id: updatedUser.id,
      phoneNumber: updatedUser.phone_number,
    }),
    user: sanitizeUser(updatedUser),
  };
}

export async function verifyUserPin(params: { challengeToken: string; pin: string }) {
  const challenge = requireAuthChallengeToken(params.challengeToken, "pin_verify");
  const user = await findUserById(challenge.sub);

  if (!user) {
    throw new Error("Account not found");
  }

  const valid = await verifyPassword(params.pin, user.pin_hash);
  if (!valid) {
    throw new Error("Invalid PIN");
  }

  logger.info("auth.pin_verify.succeeded", {
    userId: user.id,
    phoneNumber: user.phone_number,
  });

  return {
    accessToken: issueAccessToken({
      id: user.id,
      phoneNumber: user.phone_number,
    }),
    user: sanitizeUser(user),
  };
}

export async function startRegistrationOtp(phoneNumber: string, requestIp?: string | null) {
  const existingUser = await findUserByPhoneNumber(phoneNumber);
  if (existingUser) {
    throw new Error("Phone number is already registered");
  }

  return sendPhoneVerificationOtp(phoneNumber, "register", requestIp);
}

export async function startLoginOtp(phoneNumber: string, requestIp?: string | null) {
  const existingUser = await findUserByPhoneNumber(phoneNumber);
  if (!existingUser) {
    throw new Error("Account not found");
  }

  return sendPhoneVerificationOtp(phoneNumber, "login", requestIp);
}

export async function getRegisteredUserByPhoneNumber(phoneNumber: string) {
  const user = await findUserByPhoneNumber(phoneNumber);
  return user ? sanitizeUser(user) : null;
}

export async function addReceiverWalletForUser(
  authUser: AuthenticatedUser,
  params: { walletName: string; walletAddress: string },
) {
  const walletCount = await countReceiverWalletsByUserId(authUser.id);

  if (walletCount >= 3) {
    throw new Error("You can add up to 3 receiver wallets");
  }

  const wallet = await createReceiverWallet({
    userId: authUser.id,
    walletName: params.walletName,
    walletAddress: params.walletAddress,
  });

  logger.info("receiver_wallet.create.succeeded", {
    userId: authUser.id,
    walletId: wallet.id,
    walletName: wallet.wallet_name,
  });

  return wallet;
}

export async function listReceiverWalletsForUser(authUser: AuthenticatedUser) {
  return listReceiverWalletsByUserId(authUser.id);
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

function sanitizeUser(
  user: Awaited<ReturnType<typeof findUserByPhoneNumber>> extends infer T
    ? NonNullable<T>
    : never,
) {
  return {
    id: user.id,
    phoneNumber: user.phone_number,
    displayName: user.display_name,
    handle: user.trustlink_handle,
    walletAddress: user.wallet_address,
    phoneVerifiedAt: user.phone_verified_at,
    identityVerifiedAt: user.identity_verified_at,
    createdAt: user.created_at,
  };
}
