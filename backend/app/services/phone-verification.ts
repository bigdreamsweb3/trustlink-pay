import { env } from "@/app/lib/env";
import { logger } from "@/app/lib/logger";
import {
  consumeOtp,
  countRecentOtpRequests,
  countRecentOtpRequestsByIp,
  createPhoneVerification,
  deleteExpiredOtps,
  findLatestActiveOtp,
  findLatestOtpForPhoneNumber,
  findValidOtp,
  incrementOtpAttempt,
  invalidateOtp,
} from "@/app/db/phone-verifications";
import { generateOtp } from "@/app/utils/otp";
import { normalizePhoneNumber } from "@/app/utils/phone";
import { sendAuthOtp, sendOtp } from "@/app/services/whatsapp";

type OtpPurpose = "generic" | "register" | "login" | "claim" | "auth" | "pin_change";

async function dispatchOtpMessage(phoneNumber: string, otp: string, purpose: OtpPurpose) {
  if (purpose === "auth" || purpose === "pin_change") {
    await sendAuthOtp(phoneNumber, otp);
  } else {
    await sendOtp(phoneNumber, otp);
  }

  logger.info("otp.send.succeeded", {
    phoneNumber,
    purpose,
  });
}

export async function sendPhoneVerificationOtp(
  phoneNumber: string,
  purpose: OtpPurpose = "generic",
  requestIp?: string | null,
) {
  const normalizedPhoneNumber = normalizePhoneNumber(phoneNumber);
  await deleteExpiredOtps(normalizedPhoneNumber, purpose);

  const existingActiveOtp = await findLatestActiveOtp(normalizedPhoneNumber, purpose);
  if (existingActiveOtp) {
    logger.info("otp.send.reused_active_code", {
      phoneNumber: normalizedPhoneNumber,
      purpose,
      otpId: existingActiveOtp.id,
      createdAt: existingActiveOtp.created_at,
      expiresAt: existingActiveOtp.expires_at,
    });

    return {
      phoneNumber: normalizedPhoneNumber,
      expiresAt: existingActiveOtp.expires_at,
    };
  }

  const recentRequests = await countRecentOtpRequests(
    normalizedPhoneNumber,
    purpose,
    env.OTP_RATE_LIMIT_WINDOW_MINUTES,
  );
  if (recentRequests >= env.OTP_RATE_LIMIT_MAX_REQUESTS) {
    logger.warn("otp.send.rate_limited", {
      phoneNumber: normalizedPhoneNumber,
      purpose,
      recentRequests,
    });
    throw new Error("Too many OTP requests. Please try again later.");
  }

  if (requestIp) {
    const recentIpRequests = await countRecentOtpRequestsByIp(
      requestIp,
      purpose,
      env.OTP_RATE_LIMIT_WINDOW_MINUTES,
    );

    if (recentIpRequests >= env.OTP_RATE_LIMIT_MAX_REQUESTS_PER_IP) {
      logger.warn("otp.send.ip_rate_limited", {
        requestIp,
        purpose,
        recentIpRequests,
      });
      throw new Error("Too many OTP requests from this network. Please try again later.");
    }
  }

  const otp = generateOtp();
  const verification = await createPhoneVerification({
    phoneNumber: normalizedPhoneNumber,
    otpCode: otp,
    purpose,
    requestIp,
    ttlMinutes: env.OTP_TTL_MINUTES,
  });

  logger.info("otp.send.persisted", {
    phoneNumber: normalizedPhoneNumber,
    purpose,
    expiresAt: verification.expires_at,
  });

  if (purpose === "auth" || purpose === "pin_change") {
    void dispatchOtpMessage(normalizedPhoneNumber, otp, purpose).catch((error) => {
      logger.error("otp.send.failed", {
        phoneNumber: normalizedPhoneNumber,
        purpose,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    });
  } else {
    await dispatchOtpMessage(normalizedPhoneNumber, otp, purpose);
  }

  return {
    phoneNumber: normalizedPhoneNumber,
    expiresAt: verification.expires_at,
  };
}

export async function getOtpReadiness(phoneNumber: string, purpose: OtpPurpose) {
  const normalizedPhoneNumber = normalizePhoneNumber(phoneNumber);
  await deleteExpiredOtps(normalizedPhoneNumber, purpose);
  const verification = await findLatestOtpForPhoneNumber(normalizedPhoneNumber, purpose);

  return {
    ready: Boolean(verification),
    expiresAt: verification?.expires_at ?? null,
  };
}

export async function verifyPhoneOtp(
  phoneNumber: string,
  otp: string,
  options: { consume?: boolean; purpose?: OtpPurpose } = {},
) {
  const normalizedPhoneNumber = normalizePhoneNumber(phoneNumber);
  const purpose = options.purpose ?? "generic";
  await deleteExpiredOtps(normalizedPhoneNumber, purpose);

  const latestOtp = await findLatestActiveOtp(normalizedPhoneNumber, purpose);
  if (!latestOtp) {
    logger.warn("otp.verify.missing", {
      phoneNumber: normalizedPhoneNumber,
      purpose,
      submittedOtpLength: otp.length,
    });
    throw new Error("Invalid or expired OTP");
  }

  const verification = await findValidOtp(normalizedPhoneNumber, otp, purpose);

  logger.info("otp.verify.checked", {
    phoneNumber: normalizedPhoneNumber,
    purpose,
    latestOtpId: latestOtp.id,
    latestOtpCreatedAt: latestOtp.created_at,
    latestOtpExpiresAt: latestOtp.expires_at,
    matchedOtpId: verification?.id ?? null,
    matchedOtpCreatedAt: verification?.created_at ?? null,
    matchedOtpExpiresAt: verification?.expires_at ?? null,
  });

  if (!verification || verification.id !== latestOtp.id) {
    await incrementOtpAttempt(latestOtp.id);
    const nextAttemptCount = latestOtp.attempt_count + 1;

    if (nextAttemptCount >= env.OTP_MAX_ATTEMPTS) {
      await invalidateOtp(latestOtp.id);
      logger.warn("otp.verify.attempt_limit_reached", {
        phoneNumber: normalizedPhoneNumber,
        purpose,
        attemptCount: nextAttemptCount,
      });
      throw new Error("OTP attempt limit reached. Request a new code.");
    }

    logger.warn("otp.verify.failed", {
      phoneNumber: normalizedPhoneNumber,
      purpose,
      attemptCount: nextAttemptCount,
      latestOtpId: latestOtp.id,
      matchedOtpId: verification?.id ?? null,
    });
    throw new Error("Invalid or expired OTP");
  }

  if (options.consume) {
    await consumeOtp(verification.id);
  }

  logger.info("otp.verify.succeeded", {
    phoneNumber: normalizedPhoneNumber,
    purpose,
    consumed: Boolean(options.consume),
  });

  return {
    verified: true,
    phoneNumber: normalizedPhoneNumber,
  };
}
