import {
  findUserByHandle,
  findUserByPhoneNumber,
  updateUserDisplayName,
  updateUserProfileIdentity,
} from "@/app/db/users";
import { issueAuthChallengeToken } from "@/app/lib/auth";
import { env } from "@/app/lib/env";
import { logger } from "@/app/lib/logger";
import { getOtpReadiness, sendPhoneVerificationOtp, verifyPhoneOtp } from "@/app/services/phone-verification";
import { verifyWhatsAppNumber } from "@/app/services/whatsapp-number-verification";
import { getTrustLinkWhatsAppOptInLink, sendWelcomeMessage } from "@/app/services/whatsapp";
import { normalizePhoneNumber } from "@/app/utils/phone";

import { sanitizeUser } from "./shared";

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

export async function startPhoneFirstAuth(
  phoneNumber: string,
  requestIp?: string | null,
  options?: { skipWhatsAppCheck?: boolean },
) {
  const normalizedPhoneNumber = normalizePhoneNumber(phoneNumber);
  const whatsappVerification = await verifyWhatsAppNumber(normalizedPhoneNumber);
  if (!whatsappVerification.exists && !options?.skipWhatsAppCheck) {
    throw new Error("This phone number is not available on WhatsApp");
  }
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

  if (env.WHATSAPP_MOCK_MODE || existingUser?.whatsapp_opted_in) {
    const otp = await sendPhoneVerificationOtp(normalizedPhoneNumber, "auth", requestIp);
    return {
      phoneNumber: normalizedPhoneNumber,
      status: "otp_sent" as const,
      authMode: isRegistered ? ("login" as const) : ("register" as const),
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
    authMode: isRegistered ? ("login" as const) : ("register" as const),
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
    authMode: isRegistered ? ("login" as const) : ("register" as const),
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

  if (params.displayName?.trim() && user.display_name === "TrustLink User") {
    user = await updateUserDisplayName({
      userId: user.id,
      displayName: params.displayName.trim(),
    });
  }

  logger.info(
    isRegistered ? "auth.phone_first.verify_login_ready" : "auth.phone_first.verify_register_ready",
    {
      userId: user.id,
      phoneNumber: user.phone_number,
    },
  );

  return {
    challengeToken: issueAuthChallengeToken({
      id: user.id,
      phoneNumber: user.phone_number,
      stage: isRegistered && user.pin_hash ? "pin_verify" : "pin_setup",
    }),
    user: sanitizeUser(user),
    pinRequired: Boolean(isRegistered && user.pin_hash),
    pinSetupRequired: !user.pin_hash,
    isNewUser: !isRegistered,
  };
}
