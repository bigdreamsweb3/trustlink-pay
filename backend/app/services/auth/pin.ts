import {
  setUserReferralAttribution,
  findUserById,
  findUserByPhoneNumber,
  updateUserPin,
} from "@/app/db/users";
import { findLatestReferralCandidateByReceiverPhone } from "@/app/db/payments";
import { issueAccessToken, issueAuthChallengeToken, requireAuthChallengeToken } from "@/app/lib/auth";
import { logger } from "@/app/lib/logger";
import type { AuthenticatedUser } from "@/app/types/auth";
import { sendPhoneVerificationOtp, verifyPhoneOtp } from "@/app/services/phone-verification";
import { hashPassword, verifyPassword } from "@/app/utils/password";

import { sanitizeUser } from "./shared";

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

    if (referralCandidate?.sender_user_id && referralCandidate.sender_user_id !== updatedUser.id) {
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

export async function startUserPinChallenge(authUser: AuthenticatedUser) {
  const user = await findUserById(authUser.id);

  if (!user) {
    throw new Error("Account not found");
  }

  if (!user.pin_hash) {
    throw new Error("PIN is not set up for this account");
  }

  return {
    challengeToken: issueAuthChallengeToken({
      id: user.id,
      phoneNumber: user.phone_number,
      stage: "pin_verify",
    }),
    user: sanitizeUser(user),
  };
}

export async function verifyUserActionPin(authUser: AuthenticatedUser, pin: string) {
  const user = await findUserById(authUser.id);

  if (!user) {
    throw new Error("Account not found");
  }

  const valid = await verifyPassword(pin, user.pin_hash);
  if (!valid) {
    throw new Error("Invalid PIN");
  }

  logger.info("auth.pin_action_verify.succeeded", {
    userId: user.id,
    phoneNumber: user.phone_number,
  });

  return sanitizeUser(user);
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

export async function getRegisteredUserByPhoneNumber(phoneNumber: string) {
  const user = await findUserByPhoneNumber(phoneNumber);
  return user ? sanitizeUser(user) : null;
}
