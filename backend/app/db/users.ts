import type { UserRecord } from "@/app/types/payment";
import { sql } from "@/app/db/client";

export async function findUserByPhoneNumber(
  phoneNumber: string,
): Promise<UserRecord | null> {
  const rows = (await sql`
    SELECT
      id,
      phone_number,
      phone_hash,
      display_name,
      trustlink_handle,
      pin_hash,
      wallet_address,
      phone_verified_at,
      identity_verified_at,
      created_at
    FROM users
    WHERE phone_number = ${phoneNumber}
    LIMIT 1
  `) as UserRecord[];

  return rows[0] ?? null;
}

export async function findUserById(id: string): Promise<UserRecord | null> {
  const rows = (await sql`
    SELECT
      id,
      phone_number,
      phone_hash,
      display_name,
      trustlink_handle,
      pin_hash,
      wallet_address,
      phone_verified_at,
      identity_verified_at,
      created_at
    FROM users
    WHERE id = ${id}
    LIMIT 1
  `) as UserRecord[];

  return rows[0] ?? null;
}

export async function findUserByHandle(
  handle: string,
): Promise<UserRecord | null> {
  const rows = (await sql`
    SELECT
      id,
      phone_number,
      phone_hash,
      display_name,
      trustlink_handle,
      pin_hash,
      wallet_address,
      phone_verified_at,
      identity_verified_at,
      created_at
    FROM users
    WHERE trustlink_handle = ${handle}
    LIMIT 1
  `) as UserRecord[];

  return rows[0] ?? null;
}

export async function upsertUserProfile(params: {
  phoneNumber: string;
  phoneHash: string;
  displayName: string;
  handle: string;
  pinHash: string;
  walletAddress?: string;
}): Promise<UserRecord> {
  const rows = (await sql`
    INSERT INTO users (
      phone_number,
      phone_hash,
      display_name,
      trustlink_handle,
      pin_hash,
      wallet_address,
      phone_verified_at,
      identity_verified_at
    )
    VALUES (
      ${params.phoneNumber},
      ${params.phoneHash},
      ${params.displayName},
      ${params.handle},
      ${params.pinHash},
      ${params.walletAddress ?? null},
      NOW(),
      NULL
    )
    ON CONFLICT (phone_number)
    DO UPDATE SET
      phone_hash = EXCLUDED.phone_hash,
      display_name = EXCLUDED.display_name,
      trustlink_handle = EXCLUDED.trustlink_handle,
      pin_hash = EXCLUDED.pin_hash,
      wallet_address = COALESCE(EXCLUDED.wallet_address, users.wallet_address)
    RETURNING
      id,
      phone_number,
      phone_hash,
      display_name,
      trustlink_handle,
      pin_hash,
      wallet_address,
      phone_verified_at,
      identity_verified_at,
      created_at
  `) as UserRecord[];

  return rows[0];
}

export async function updateUserPin(params: {
  userId: string;
  pinHash: string;
}): Promise<UserRecord> {
  const rows = (await sql`
    UPDATE users
    SET
      pin_hash = ${params.pinHash},
      phone_verified_at = COALESCE(phone_verified_at, NOW())
    WHERE id = ${params.userId}
    RETURNING
      id,
      phone_number,
      phone_hash,
      display_name,
      trustlink_handle,
      pin_hash,
      wallet_address,
      phone_verified_at,
      identity_verified_at,
      created_at
  `) as UserRecord[];

  return rows[0];
}

export async function updateUserProfileIdentity(params: {
  userId: string;
  displayName: string;
  handle: string;
}): Promise<UserRecord> {
  const rows = (await sql`
    UPDATE users
    SET
      display_name = ${params.displayName},
      trustlink_handle = ${params.handle}
    WHERE id = ${params.userId}
    RETURNING
      id,
      phone_number,
      phone_hash,
      display_name,
      trustlink_handle,
      pin_hash,
      wallet_address,
      phone_verified_at,
      identity_verified_at,
      created_at
  `) as UserRecord[];

  return rows[0];
}

export async function updateUserWallet(params: {
  phoneNumber: string;
  phoneHash: string;
  walletAddress: string;
  markPhoneVerified?: boolean;
}): Promise<UserRecord> {
  const rows = (await sql`
    UPDATE users
    SET
      phone_hash = ${params.phoneHash},
      wallet_address = ${params.walletAddress},
      phone_verified_at = CASE
        WHEN ${params.markPhoneVerified ?? false} THEN NOW()
        ELSE phone_verified_at
      END,
      identity_verified_at = CASE
        WHEN ${params.markPhoneVerified ?? false} THEN COALESCE(identity_verified_at, NOW())
        ELSE identity_verified_at
      END
    WHERE phone_number = ${params.phoneNumber}
    RETURNING
      id,
      phone_number,
      phone_hash,
      display_name,
      trustlink_handle,
      pin_hash,
      wallet_address,
      phone_verified_at,
      identity_verified_at,
      created_at
  `) as UserRecord[];

  return rows[0];
}
