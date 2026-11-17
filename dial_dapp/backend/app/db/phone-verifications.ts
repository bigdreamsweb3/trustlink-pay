import type { PhoneVerificationRecord } from "@/app/types/payment";
import { sql } from "@/app/db/client";
import { logger } from "@/app/lib/logger";
import { normalizePhoneNumber } from "@/app/utils/phone";

function isMissingColumn(error: unknown, columnName: string) {
  return error instanceof Error && error.message.toLowerCase().includes(columnName);
}

export async function createPhoneVerification(params: {
  phoneNumber: string;
  otpCode: string;
  purpose: string;
  requestIp?: string | null;
  ttlMinutes: number;
}): Promise<PhoneVerificationRecord> {
  const normalizedPhoneNumber = normalizePhoneNumber(params.phoneNumber);

  try {
    logger.info("otp.db.insert_attempt", {
      phoneNumber: normalizedPhoneNumber,
      purpose: params.purpose,
      ttlMinutes: params.ttlMinutes,
      strategy: "full_schema",
    });

    const rows = (await sql`
      INSERT INTO phone_verifications (
        phone_number,
        otp_code,
        purpose,
        request_ip,
        attempt_count,
        consumed_at,
        expires_at
      )
      VALUES (
        ${normalizedPhoneNumber},
        ${params.otpCode},
        ${params.purpose},
        ${params.requestIp ?? null},
        0,
        NULL,
        NOW() + (${params.ttlMinutes} * INTERVAL '1 minute')
      )
      RETURNING id, phone_number, otp_code, purpose, attempt_count, consumed_at, expires_at, created_at
    `) as PhoneVerificationRecord[];

    logger.info("otp.db.insert_succeeded", {
      phoneNumber: normalizedPhoneNumber,
      purpose: params.purpose,
      otpId: rows[0]?.id ?? null,
      createdAt: rows[0]?.created_at ?? null,
      expiresAt: rows[0]?.expires_at ?? null,
      strategy: "full_schema",
    });

    return rows[0];
  } catch (error) {
    logger.warn("otp.db.insert_failed", {
      phoneNumber: normalizedPhoneNumber,
      purpose: params.purpose,
      strategy: "full_schema",
      error: error instanceof Error ? error.message : "Unknown error",
    });

    if (!isMissingColumn(error, "attempt_count") && !isMissingColumn(error, "consumed_at")) {
      throw error;
    }

    logger.info("otp.db.insert_attempt", {
      phoneNumber: normalizedPhoneNumber,
      purpose: params.purpose,
      ttlMinutes: params.ttlMinutes,
      strategy: "legacy_schema",
    });

    const rows = (await sql`
      INSERT INTO phone_verifications (phone_number, otp_code, purpose, request_ip, expires_at)
      VALUES (
        ${normalizedPhoneNumber},
        ${params.otpCode},
        ${params.purpose},
        ${params.requestIp ?? null},
        NOW() + (${params.ttlMinutes} * INTERVAL '1 minute')
      )
      RETURNING
        id,
        phone_number,
        otp_code,
        purpose,
        0::integer AS attempt_count,
        NULL::timestamptz AS consumed_at,
        expires_at,
        created_at
    `) as PhoneVerificationRecord[];

    logger.info("otp.db.insert_succeeded", {
      phoneNumber: normalizedPhoneNumber,
      purpose: params.purpose,
      otpId: rows[0]?.id ?? null,
      createdAt: rows[0]?.created_at ?? null,
      expiresAt: rows[0]?.expires_at ?? null,
      strategy: "legacy_schema",
    });

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
    if (isMissingColumn(error, "request_ip")) {
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
  const normalizedPhoneNumber = normalizePhoneNumber(phoneNumber);
  const rows = (await sql`
    SELECT COUNT(*)::text AS count
    FROM phone_verifications
    WHERE phone_number = ${normalizedPhoneNumber}
      AND purpose = ${purpose}
      AND created_at >= NOW() - (${windowMinutes} * INTERVAL '1 minute')
  `) as { count: string }[];

  return Number(rows[0]?.count ?? 0);
}

export async function findLatestActiveOtp(
  phoneNumber: string,
  purpose: string
): Promise<PhoneVerificationRecord | null> {
  const normalizedPhoneNumber = normalizePhoneNumber(phoneNumber);

  try {
    const rows = (await sql`
      SELECT id, phone_number, otp_code, purpose, attempt_count, consumed_at, expires_at, created_at
      FROM phone_verifications
      WHERE phone_number = ${normalizedPhoneNumber}
        AND purpose = ${purpose}
        AND expires_at >= NOW()
        AND consumed_at IS NULL
      ORDER BY created_at DESC
      LIMIT 1
    `) as PhoneVerificationRecord[];

    return rows[0] ?? null;
  } catch (error) {
    if (!isMissingColumn(error, "consumed_at")) {
      throw error;
    }

    const rows = (await sql`
      SELECT
        id,
        phone_number,
        otp_code,
        purpose,
        0::integer AS attempt_count,
        NULL::timestamptz AS consumed_at,
        expires_at,
        created_at
      FROM phone_verifications
      WHERE phone_number = ${normalizedPhoneNumber}
        AND purpose = ${purpose}
        AND expires_at >= NOW()
      ORDER BY created_at DESC
      LIMIT 1
    `) as PhoneVerificationRecord[];

    return rows[0] ?? null;
  }
}

export async function findValidOtp(
  phoneNumber: string,
  otpCode: string,
  purpose: string
): Promise<PhoneVerificationRecord | null> {
  const normalizedPhoneNumber = normalizePhoneNumber(phoneNumber);

  try {
    const rows = (await sql`
      SELECT id, phone_number, otp_code, purpose, attempt_count, consumed_at, expires_at, created_at
      FROM phone_verifications
      WHERE phone_number = ${normalizedPhoneNumber}
        AND otp_code = ${otpCode}
        AND purpose = ${purpose}
        AND expires_at >= NOW()
        AND consumed_at IS NULL
      ORDER BY created_at DESC
      LIMIT 1
    `) as PhoneVerificationRecord[];

    return rows[0] ?? null;
  } catch (error) {
    if (!isMissingColumn(error, "consumed_at")) {
      throw error;
    }

    const rows = (await sql`
      SELECT
        id,
        phone_number,
        otp_code,
        purpose,
        0::integer AS attempt_count,
        NULL::timestamptz AS consumed_at,
        expires_at,
        created_at
      FROM phone_verifications
      WHERE phone_number = ${normalizedPhoneNumber}
        AND otp_code = ${otpCode}
        AND purpose = ${purpose}
        AND expires_at >= NOW()
      ORDER BY created_at DESC
      LIMIT 1
    `) as PhoneVerificationRecord[];

    return rows[0] ?? null;
  }
}

export async function findLatestOtpForPhoneNumber(
  phoneNumber: string,
  purpose?: string
): Promise<PhoneVerificationRecord | null> {
  const normalizedPhoneNumber = normalizePhoneNumber(phoneNumber);

  try {
    const rows = purpose
      ? ((await sql`
          SELECT id, phone_number, otp_code, purpose, attempt_count, consumed_at, expires_at, created_at
          FROM phone_verifications
          WHERE phone_number = ${normalizedPhoneNumber}
            AND purpose = ${purpose}
            AND expires_at >= NOW()
            AND consumed_at IS NULL
          ORDER BY created_at DESC
          LIMIT 1
        `) as PhoneVerificationRecord[])
      : ((await sql`
          SELECT id, phone_number, otp_code, purpose, attempt_count, consumed_at, expires_at, created_at
          FROM phone_verifications
          WHERE phone_number = ${normalizedPhoneNumber}
            AND expires_at >= NOW()
            AND consumed_at IS NULL
          ORDER BY created_at DESC
          LIMIT 1
        `) as PhoneVerificationRecord[]);

    return rows[0] ?? null;
  } catch (error) {
    if (!isMissingColumn(error, "consumed_at")) {
      throw error;
    }

    const rows = purpose
      ? ((await sql`
          SELECT
            id,
            phone_number,
            otp_code,
            purpose,
            0::integer AS attempt_count,
            NULL::timestamptz AS consumed_at,
            expires_at,
            created_at
          FROM phone_verifications
          WHERE phone_number = ${normalizedPhoneNumber}
            AND purpose = ${purpose}
            AND expires_at >= NOW()
          ORDER BY created_at DESC
          LIMIT 1
        `) as PhoneVerificationRecord[])
      : ((await sql`
          SELECT
            id,
            phone_number,
            otp_code,
            purpose,
            0::integer AS attempt_count,
            NULL::timestamptz AS consumed_at,
            expires_at,
            created_at
          FROM phone_verifications
          WHERE phone_number = ${normalizedPhoneNumber}
            AND expires_at >= NOW()
          ORDER BY created_at DESC
          LIMIT 1
        `) as PhoneVerificationRecord[]);

    return rows[0] ?? null;
  }
}

export async function incrementOtpAttempt(id: string) {
  try {
    await sql`
      UPDATE phone_verifications
      SET attempt_count = attempt_count + 1
      WHERE id = ${id}
    `;
  } catch (error) {
    if (!isMissingColumn(error, "attempt_count")) {
      throw error;
    }
  }
}

export async function consumeOtp(id: string): Promise<void> {
  try {
    await sql`
      UPDATE phone_verifications
      SET consumed_at = NOW()
      WHERE id = ${id}
    `;
  } catch (error) {
    if (!isMissingColumn(error, "consumed_at")) {
      throw error;
    }

    await sql`
      DELETE FROM phone_verifications
      WHERE id = ${id}
    `;
  }
}

export async function invalidateOtp(id: string) {
  await consumeOtp(id);
}

export async function deleteExpiredOtps(phoneNumber: string, purpose?: string): Promise<void> {
  const normalizedPhoneNumber = normalizePhoneNumber(phoneNumber);

  if (purpose) {
    await sql`
      DELETE FROM phone_verifications
      WHERE phone_number = ${normalizedPhoneNumber}
        AND purpose = ${purpose}
        AND expires_at < NOW()
    `;
    return;
  }

  await sql`
    DELETE FROM phone_verifications
    WHERE phone_number = ${normalizedPhoneNumber}
      AND expires_at < NOW()
  `;
}
