import { env } from "@/app/lib/env";
import { logger } from "@/app/lib/logger";
import {
  consumeOtp,
  countRecentOtpRequests,
  countRecentOtpRequestsByIp,
  createPhoneVerification,
  deleteExpiredOtps,
  findValidOtp
} from "@/app/db/phone-verifications";
import { generateOtp, getOtpExpiryDate } from "@/app/utils/otp";
import { sendOtp } from "@/app/services/whatsapp";

export async function sendPhoneVerificationOtp(phoneNumber: string, purpose = "generic", requestIp?: string | null) {
  await deleteExpiredOtps(phoneNumber, purpose);

  const recentRequests = await countRecentOtpRequests(phoneNumber, purpose, env.OTP_RATE_LIMIT_WINDOW_MINUTES);
  if (recentRequests >= env.OTP_RATE_LIMIT_MAX_REQUESTS) {
    logger.warn("otp.send.rate_limited", {
      phoneNumber,
      purpose,
      recentRequests
    });
    throw new Error("Too many OTP requests. Please try again later.");
  }

  if (requestIp) {
    const recentIpRequests = await countRecentOtpRequestsByIp(
      requestIp,
      purpose,
      env.OTP_RATE_LIMIT_WINDOW_MINUTES
    );

    if (recentIpRequests >= env.OTP_RATE_LIMIT_MAX_REQUESTS_PER_IP) {
      logger.warn("otp.send.ip_rate_limited", {
        requestIp,
        purpose,
        recentIpRequests
      });
      throw new Error("Too many OTP requests from this network. Please try again later.");
    }
  }

  const otp = generateOtp();
  const expiresAt = getOtpExpiryDate(env.OTP_TTL_MINUTES);

  await createPhoneVerification({
    phoneNumber,
    otpCode: otp,
    purpose,
    requestIp,
    expiresAt
  });

  await sendOtp(phoneNumber, otp);

  logger.info("otp.send.succeeded", {
    phoneNumber,
    purpose,
    expiresAt: expiresAt.toISOString()
  });

  return {
    phoneNumber,
    expiresAt: expiresAt.toISOString()
  };
}

export async function verifyPhoneOtp(
  phoneNumber: string,
  otp: string,
  options: { consume?: boolean; purpose?: string } = {}
) {
  const purpose = options.purpose ?? "generic";
  await deleteExpiredOtps(phoneNumber, purpose);
  const verification = await findValidOtp(phoneNumber, otp, purpose);

  if (!verification) {
    logger.warn("otp.verify.failed", {
      phoneNumber,
      purpose
    });
    throw new Error("Invalid or expired OTP");
  }

  if (options.consume) {
    await consumeOtp(verification.id);
  }

  logger.info("otp.verify.succeeded", {
    phoneNumber,
    purpose,
    consumed: Boolean(options.consume)
  });

  return {
    verified: true,
    phoneNumber
  };
}
