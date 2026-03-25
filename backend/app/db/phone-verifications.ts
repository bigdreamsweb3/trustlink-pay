import type { PhoneVerificationRecord } from "@/app/types/payment";
import { sql } from "@/app/db/client";

function isMissingRequestIpColumn(error: unknown) {
  return error instanceof Error && error.message.toLowerCase().includes('request_ip');
}

export async function createPhoneVerification(params: {
  phoneNumber: string;
  otpCode: string;
  purpose: string;
  requestIp?: string | null;
  expiresAt: Date;
}): Promise<PhoneVerificationRecord> {
  try {
    const rows = (await sql`
      INSERT INTO phone_verifications (phone_number, otp_code, purpose, request_ip, expires_at)
      VALUES (${params.phoneNumber}, ${params.otpCode}, ${params.purpose}, ${params.requestIp ?? null}, ${params.expiresAt.toISOString()})
      RETURNING id, phone_number, otp_code, purpose, expires_at, created_at
    `) as PhoneVerificationRecord[];

    return rows[0];
  } catch (error) {
    if (!isMissingRequestIpColumn(error)) {
      throw error;
    }

    const rows = (await sql`
      INSERT INTO phone_verifications (phone_number, otp_code, purpose, expires_at)
      VALUES (${params.phoneNumber}, ${params.otpCode}, ${params.purpose}, ${params.expiresAt.toISOString()})
      RETURNING id, phone_number, otp_code, purpose, expires_at, created_at
    `) as PhoneVerificationRecord[];

    return rows[0];
  }
}

export async function countRecentOtpRequestsByIp(
  requestIp: string,
  purpose: string,
  windowMinutes: number
): Promise<number> {
  try {
    const rows = (await sql`
      SELECT COUNT(*)::text AS count
      FROM phone_verifications
      WHERE request_ip = ${requestIp}
        AND purpose = ${purpose}
        AND created_at >= NOW() - (${windowMinutes} * INTERVAL '1 minute')
    `) as { count: string }[];

    return Number(rows[0]?.count ?? 0);
  } catch (error) {
    if (isMissingRequestIpColumn(error)) {
      return 0;
    }

    throw error;
  }
}

export async function countRecentOtpRequests(
  phoneNumber: string,
  purpose: string,
  windowMinutes: number
): Promise<number> {
  const rows = (await sql`
    SELECT COUNT(*)::text AS count
    FROM phone_verifications
    WHERE phone_number = ${phoneNumber}
      AND purpose = ${purpose}
      AND created_at >= NOW() - (${windowMinutes} * INTERVAL '1 minute')
  `) as { count: string }[];

  return Number(rows[0]?.count ?? 0);
}

export async function findValidOtp(
  phoneNumber: string,
  otpCode: string,
  purpose: string
): Promise<PhoneVerificationRecord | null> {
  const rows = (await sql`
    SELECT id, phone_number, otp_code, purpose, expires_at, created_at
    FROM phone_verifications
    WHERE phone_number = ${phoneNumber}
      AND otp_code = ${otpCode}
      AND purpose = ${purpose}
      AND expires_at >= NOW()
    ORDER BY created_at DESC
    LIMIT 1
  `) as PhoneVerificationRecord[];

  return rows[0] ?? null;
}

export async function findLatestOtpForPhoneNumber(
  phoneNumber: string,
  purpose?: string
): Promise<PhoneVerificationRecord | null> {
  const rows = purpose
    ? ((await sql`
        SELECT id, phone_number, otp_code, purpose, expires_at, created_at
        FROM phone_verifications
        WHERE phone_number = ${phoneNumber}
          AND purpose = ${purpose}
          AND expires_at >= NOW()
        ORDER BY created_at DESC
        LIMIT 1
      `) as PhoneVerificationRecord[])
    : ((await sql`
        SELECT id, phone_number, otp_code, purpose, expires_at, created_at
        FROM phone_verifications
        WHERE phone_number = ${phoneNumber}
          AND expires_at >= NOW()
        ORDER BY created_at DESC
        LIMIT 1
      `) as PhoneVerificationRecord[]);

  return rows[0] ?? null;
}

export async function consumeOtp(id: string): Promise<void> {
  await sql`
    DELETE FROM phone_verifications
    WHERE id = ${id}
  `;
}

export async function deleteExpiredOtps(phoneNumber: string, purpose?: string): Promise<void> {
  if (purpose) {
    await sql`
      DELETE FROM phone_verifications
      WHERE phone_number = ${phoneNumber}
        AND purpose = ${purpose}
        AND expires_at < NOW()
    `;
    return;
  }

  await sql`
    DELETE FROM phone_verifications
    WHERE phone_number = ${phoneNumber}
      AND expires_at < NOW()
  `;
}
