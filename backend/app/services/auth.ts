import {
  setUserReferralAttribution,
  findUserByHandle,
  findUserById,
  findUserByPhoneNumber,
  updateUserDisplayName,
  updateUserPin,
  updateUserProfileIdentity,
} from "@/app/db/users";
import { findLatestReferralCandidateByReceiverPhone } from "@/app/db/payments";
import {
  countReceiverWalletsByUserId,
  createReceiverWallet,
  deleteReceiverWalletById,
  listReceiverWalletsByUserId,
} from "@/app/db/receiver-wallets";
import { issueAccessToken, issueAuthChallengeToken, requireAuthChallengeToken } from "@/app/lib/auth";
import { env } from "@/app/lib/env";
import { logger } from "@/app/lib/logger";
import type { AuthenticatedUser } from "@/app/types/auth";
import { getOtpReadiness, sendPhoneVerificationOtp, verifyPhoneOtp } from "@/app/services/phone-verification";
import { getTrustLinkWhatsAppOptInLink, sendWelcomeMessage } from "@/app/services/whatsapp";
import { normalizePhoneNumber } from "@/app/utils/phone";
import { hashPassword, verifyPassword } from "@/app/utils/password";

export async function registerUser(params: {
  phoneNumber: string;
  otp: string;
  displayName: string;
  handle: string;
  walletAddress?: string;
}) {
  const normalizedPhoneNumber = normalizePhoneNumber(params.phoneNumber);
  const existingByHandle = await findUserByHandle(params.handle);
  const existingByPhone = await findUserByPhoneNumber(normalizedPhoneNumber);

  if (!existingByPhone) {
    throw new Error("Account not found");
  }

  if (existingByPhone.phone_verified_at) {
    throw new Error("Phone number is already registered");
  }

  if (existingByHandle && existingByHandle.id !== existingByPhone.id) {
    throw new Error("Handle is already taken");
  }

  await verifyPhoneOtp(normalizedPhoneNumber, params.otp, {
    consume: true,
    purpose: "auth",
  });

  const user = await updateUserProfileIdentity({
    userId: existingByPhone.id,
    displayName: params.displayName,
    handle: params.handle,
  });

  try {
    await sendWelcomeMessage(normalizedPhoneNumber, params.displayName, params.handle);
  } catch (error) {
    logger.warn("auth.register.welcome_message_failed", {
      phoneNumber: normalizedPhoneNumber,
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
  displayName?: string;
}) {
  const normalizedPhoneNumber = normalizePhoneNumber(params.phoneNumber);
  let user = await findUserByPhoneNumber(normalizedPhoneNumber);

  if (!user) {
    throw new Error("Account not found");
  }

  await verifyPhoneOtp(normalizedPhoneNumber, params.otp, {
    consume: true,
    purpose: "auth",
  });

  if (params.displayName?.trim() && user.display_name === "TrustLink User") {
    user = await updateUserDisplayName({
      userId: user.id,
      displayName: params.displayName.trim(),
    });
  }

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
    isNewUser: !user.phone_verified_at,
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

  if (!user.phone_verified_at && !user.referred_by_user_id) {
    const referralCandidate = await findLatestReferralCandidateByReceiverPhone(updatedUser.phone_number);

    if (
      referralCandidate?.sender_user_id &&
      referralCandidate.sender_user_id !== updatedUser.id
    ) {
      await setUserReferralAttribution({
        userId: updatedUser.id,
        referredByUserId: referralCandidate.sender_user_id,
        referralSourcePaymentId: referralCandidate.id,
      });
    }
  }

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

export async function startPinChangeOtp(authUser: AuthenticatedUser, requestIp?: string | null) {
  const user = await findUserById(authUser.id);

  if (!user) {
    throw new Error("Account not found");
  }

  const otp = await sendPhoneVerificationOtp(user.phone_number, "pin_change", requestIp);

  return {
    phoneNumber: user.phone_number,
    expiresAt: otp.expiresAt,
  };
}

export async function changeUserPinWithOtp(authUser: AuthenticatedUser, params: { otp: string; newPin: string }) {
  const user = await findUserById(authUser.id);

  if (!user) {
    throw new Error("Account not found");
  }

  await verifyPhoneOtp(user.phone_number, params.otp, {
    consume: true,
    purpose: "pin_change",
  });

  const updatedUser = await updateUserPin({
    userId: user.id,
    pinHash: await hashPassword(params.newPin),
  });

  logger.info("auth.pin_change.succeeded", {
    userId: updatedUser.id,
    phoneNumber: updatedUser.phone_number,
  });

  return {
    user: sanitizeUser(updatedUser),
  };
}

export async function startRegistrationOtp(phoneNumber: string, requestIp?: string | null) {
  const normalizedPhoneNumber = normalizePhoneNumber(phoneNumber);
  const existingUser = await findUserByPhoneNumber(normalizedPhoneNumber);
  if (existingUser?.phone_verified_at) {
    throw new Error("Phone number is already registered");
  }

  if (env.WHATSAPP_MOCK_MODE) {
    const otp = await sendPhoneVerificationOtp(normalizedPhoneNumber, "auth", requestIp);
    return {
      ...otp,
      optedIn: true,
      requiresOptIn: false,
      whatsappUrl: null,
    };
  }

  if (!existingUser?.whatsapp_opted_in) {
    return {
      phoneNumber: normalizedPhoneNumber,
      optedIn: false,
      requiresOptIn: true,
      whatsappUrl: getTrustLinkWhatsAppOptInLink(),
      expiresAt: null,
    };
  }

  const otp = await sendPhoneVerificationOtp(normalizedPhoneNumber, "auth", requestIp);
  return {
    ...otp,
    optedIn: true,
    requiresOptIn: false,
    whatsappUrl: null,
  };
}

export async function startLoginOtp(phoneNumber: string, requestIp?: string | null) {
  const normalizedPhoneNumber = normalizePhoneNumber(phoneNumber);
  const existingUser = await findUserByPhoneNumber(normalizedPhoneNumber);
  if (!existingUser) {
    throw new Error("Account not found");
  }

  if (env.WHATSAPP_MOCK_MODE) {
    const otp = await sendPhoneVerificationOtp(normalizedPhoneNumber, "auth", requestIp);
    return {
      ...otp,
      optedIn: true,
      requiresOptIn: false,
      whatsappUrl: null,
    };
  }

  if (!existingUser.whatsapp_opted_in) {
    return {
      phoneNumber: normalizedPhoneNumber,
      optedIn: false,
      requiresOptIn: true,
      whatsappUrl: getTrustLinkWhatsAppOptInLink(),
      expiresAt: null,
    };
  }

  const otp = await sendPhoneVerificationOtp(normalizedPhoneNumber, "auth", requestIp);
  return {
    ...otp,
    optedIn: true,
    requiresOptIn: false,
    whatsappUrl: null,
  };
}

export async function startPhoneFirstAuth(phoneNumber: string, requestIp?: string | null) {
  const normalizedPhoneNumber = normalizePhoneNumber(phoneNumber);
  const existingUser = await findUserByPhoneNumber(normalizedPhoneNumber);
  const isRegistered = Boolean(existingUser?.phone_verified_at);
  const suggestedDisplayName = existingUser?.display_name ?? null;

  logger.info("auth.phone_first.start", {
    phoneNumber: normalizedPhoneNumber,
    requestIp: requestIp ?? null,
    isRegistered,
    hasUser: Boolean(existingUser),
    whatsappOptedIn: Boolean(existingUser?.whatsapp_opted_in),
    optInTimestamp: existingUser?.opt_in_timestamp ?? null,
    mockMode: env.WHATSAPP_MOCK_MODE,
  });

  if (env.WHATSAPP_MOCK_MODE) {
    const otp = await sendPhoneVerificationOtp(normalizedPhoneNumber, "auth", requestIp);
    return {
      phoneNumber: normalizedPhoneNumber,
      status: "otp_sent" as const,
      authMode: isRegistered ? "login" as const : "register" as const,
      isRegistered,
      suggestedDisplayName,
      optedIn: true,
      otpReady: true,
      expiresAt: otp.expiresAt,
      whatsappUrl: null,
    };
  }

  if (existingUser?.whatsapp_opted_in) {
    const otp = await sendPhoneVerificationOtp(normalizedPhoneNumber, "auth", requestIp);
    return {
      phoneNumber: normalizedPhoneNumber,
      status: "otp_sent" as const,
      authMode: isRegistered ? "login" as const : "register" as const,
      isRegistered,
      suggestedDisplayName,
      optedIn: true,
      otpReady: true,
      expiresAt: otp.expiresAt,
      whatsappUrl: null,
    };
  }

  return {
    phoneNumber: normalizedPhoneNumber,
    status: "awaiting_whatsapp_opt_in" as const,
    authMode: isRegistered ? "login" as const : "register" as const,
    isRegistered,
    suggestedDisplayName,
    optedIn: false,
    otpReady: false,
    expiresAt: null,
    whatsappUrl: getTrustLinkWhatsAppOptInLink(),
  };
}

export async function getPhoneFirstAuthStatus(phoneNumber: string) {
  const normalizedPhoneNumber = normalizePhoneNumber(phoneNumber);
  const user = await findUserByPhoneNumber(normalizedPhoneNumber);
  let otpStatus = await getOtpReadiness(normalizedPhoneNumber, "auth");
  const isRegistered = Boolean(user?.phone_verified_at);
  const suggestedDisplayName = user?.display_name ?? null;

  logger.info("auth.phone_first.status_checked", {
    phoneNumber: normalizedPhoneNumber,
    isRegistered,
    hasUser: Boolean(user),
    whatsappOptedIn: Boolean(user?.whatsapp_opted_in),
    optInTimestamp: user?.opt_in_timestamp ?? null,
    otpReady: otpStatus.ready,
    otpExpiresAt: otpStatus.expiresAt,
  });

  if (user?.whatsapp_opted_in && !otpStatus.ready) {
    const otp = await sendPhoneVerificationOtp(normalizedPhoneNumber, "auth");
    otpStatus = {
      ready: true,
      expiresAt: otp.expiresAt,
    };

    logger.info("auth.phone_first.status_issued_otp", {
      phoneNumber: normalizedPhoneNumber,
      otpExpiresAt: otp.expiresAt,
    });
  }

  return {
    phoneNumber: normalizedPhoneNumber,
    authMode: isRegistered ? "login" as const : "register" as const,
    isRegistered,
    suggestedDisplayName,
    optedIn: Boolean(user?.whatsapp_opted_in),
    otpReady: otpStatus.ready,
    expiresAt: otpStatus.expiresAt,
  };
}

export async function verifyPhoneFirstAuth(params: {
  phoneNumber: string;
  otp: string;
  displayName?: string;
}) {
  const normalizedPhoneNumber = normalizePhoneNumber(params.phoneNumber);
  let user = await findUserByPhoneNumber(normalizedPhoneNumber);

  logger.info("auth.phone_first.verify_attempt", {
    phoneNumber: normalizedPhoneNumber,
    hasUser: Boolean(user),
    isRegistered: Boolean(user?.phone_verified_at),
    hasPin: Boolean(user?.pin_hash),
    displayNameProvided: Boolean(params.displayName?.trim()),
  });

  if (!user) {
    throw new Error("Account not found");
  }

  await verifyPhoneOtp(normalizedPhoneNumber, params.otp, {
    consume: true,
    purpose: "auth",
  });

  const isRegistered = Boolean(user.phone_verified_at);

  if (isRegistered) {
    if (params.displayName?.trim() && user.display_name === "TrustLink User") {
      user = await updateUserDisplayName({
        userId: user.id,
        displayName: params.displayName.trim(),
      });
    }

    logger.info("auth.phone_first.verify_login_ready", {
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
      isNewUser: false,
    };
  }

  if (params.displayName?.trim() && user.display_name === "TrustLink User") {
    user = await updateUserDisplayName({
      userId: user.id,
      displayName: params.displayName.trim(),
    });
  }

  logger.info("auth.phone_first.verify_register_ready", {
    userId: user.id,
    phoneNumber: user.phone_number,
  });

  return {
    challengeToken: issueAuthChallengeToken({
      id: user.id,
      phoneNumber: user.phone_number,
      stage: "pin_setup",
    }),
    user: sanitizeUser(user),
    pinRequired: false,
    pinSetupRequired: true,
    isNewUser: true,
  };
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
    whatsappOptedIn: user.whatsapp_opted_in,
    optInTimestamp: user.opt_in_timestamp,
    optOutTimestamp: user.opt_out_timestamp,
    phoneVerifiedAt: user.phone_verified_at,
    identityVerifiedAt: user.identity_verified_at,
    referredByUserId: user.referred_by_user_id,
    referralSourcePaymentId: user.referral_source_payment_id,
    referredAt: user.referred_at,
    createdAt: user.created_at,
  };
}
