import { randomUUID } from "node:crypto";

import type { UserRecord } from "@/app/types/payment";
import { sql } from "@/app/db/client";
import { generatePhoneIdentityPublicKey } from "@/app/lib/privacy-keys";
import { normalizePhoneNumber } from "@/app/utils/phone";

let userAutoclaimColumnReady: Promise<void> | null = null;

function createGeneratedHandle() {
  return `user_${randomUUID().replace(/-/g, "").slice(0, 8)}`;
}

function getSeedDisplayName(displayName?: string | null) {
  const normalizedDisplayName = displayName?.trim();
  return normalizedDisplayName ? normalizedDisplayName : null;
}

async function ensureUserAutoclaimColumn() {
  if (!userAutoclaimColumnReady) {
    userAutoclaimColumnReady = (async () => {
      await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS receiver_autoclaim_enabled BOOLEAN NOT NULL DEFAULT false`;
    })().catch((error) => {
      userAutoclaimColumnReady = null;
      throw error;
    });
  }

  await userAutoclaimColumnReady;
}

async function insertUserProfile(params: {
  phoneNumber: string;
  phoneHash: string;
  displayName: string;
  handle: string;
  pinHash: string;
  walletAddress?: string;
  whatsappOptedIn?: boolean;
  optInTimestamp?: Date | null;
  phoneVerifiedAt?: Date | null;
}) {
  await ensureUserAutoclaimColumn();
  const rows = (await sql`
    INSERT INTO users (
      phone_number,
      phone_hash,
      display_name,
      trustlink_handle,
      pin_hash,
      wallet_address,
      receiver_autoclaim_enabled,
      whatsapp_opted_in,
      opt_in_timestamp,
      phone_verified_at,
      identity_verified_at,
      referred_by_user_id,
      referral_source_payment_id,
      referred_at
    )
    VALUES (
      ${params.phoneNumber},
      ${params.phoneHash},
      ${params.displayName},
      ${params.handle},
      ${params.pinHash},
      ${params.walletAddress ?? null},
      false,
      ${params.whatsappOptedIn ?? false},
      ${params.optInTimestamp?.toISOString() ?? null},
      ${params.phoneVerifiedAt?.toISOString() ?? null},
      NULL,
      NULL,
      NULL,
      NULL
    )
    RETURNING
      id,
      phone_number,
      phone_hash,
      phone_identity_pubkey,
      privacy_view_pubkey,
      privacy_spend_pubkey,
      settlement_wallet_pubkey,
      recovery_wallet_pubkey,
      binding_signature,
      display_name,
      trustlink_handle,
      pin_hash,
      wallet_address,
      receiver_autoclaim_enabled,
      whatsapp_opted_in,
      opt_in_timestamp,
      opt_out_timestamp,
      phone_verified_at,
      identity_verified_at,
      referred_by_user_id,
      referral_source_payment_id,
      referred_at,
      created_at
  `) as UserRecord[];

  return rows[0];
}

export async function findUserByPhoneNumber(phoneNumber: string): Promise<UserRecord | null> {
  await ensureUserAutoclaimColumn();
  const normalizedPhoneNumber = normalizePhoneNumber(phoneNumber);
  const rows = (await sql`
    SELECT
      id,
      phone_number,
      phone_hash,
      phone_identity_pubkey,
      privacy_view_pubkey,
      privacy_spend_pubkey,
      settlement_wallet_pubkey,
      recovery_wallet_pubkey,
      binding_signature,
      display_name,
      trustlink_handle,
      pin_hash,
      wallet_address,
      receiver_autoclaim_enabled,
      whatsapp_opted_in,
      opt_in_timestamp,
      opt_out_timestamp,
      phone_verified_at,
      identity_verified_at,
      referred_by_user_id,
      referral_source_payment_id,
      referred_at,
      created_at
    FROM users
    WHERE phone_number = ${normalizedPhoneNumber}
    LIMIT 1
  `) as UserRecord[];

  return rows[0] ?? null;
}

export async function findUserById(id: string): Promise<UserRecord | null> {
  await ensureUserAutoclaimColumn();
  const rows = (await sql`
    SELECT
      id,
      phone_number,
      phone_hash,
      phone_identity_pubkey,
      privacy_view_pubkey,
      privacy_spend_pubkey,
      settlement_wallet_pubkey,
      recovery_wallet_pubkey,
      binding_signature,
      display_name,
      trustlink_handle,
      pin_hash,
      wallet_address,
      receiver_autoclaim_enabled,
      whatsapp_opted_in,
      opt_in_timestamp,
      opt_out_timestamp,
      phone_verified_at,
      identity_verified_at,
      referred_by_user_id,
      referral_source_payment_id,
      referred_at,
      created_at
    FROM users
    WHERE id = ${id}
    LIMIT 1
  `) as UserRecord[];

  return rows[0] ?? null;
}

export async function findUserByHandle(handle: string): Promise<UserRecord | null> {
  const rows = (await sql`
    SELECT
      id,
      phone_number,
      phone_hash,
      display_name,
      trustlink_handle,
      pin_hash,
      wallet_address,
      receiver_autoclaim_enabled,
      whatsapp_opted_in,
      opt_in_timestamp,
      opt_out_timestamp,
      phone_verified_at,
      identity_verified_at,
      referred_by_user_id,
      referral_source_payment_id,
      referred_at,
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
  const normalizedPhoneNumber = normalizePhoneNumber(params.phoneNumber);
  const rows = (await sql`
    INSERT INTO users (
      phone_number,
      phone_hash,
      display_name,
      trustlink_handle,
      pin_hash,
      wallet_address,
      phone_verified_at,
      identity_verified_at,
      referred_by_user_id,
      referral_source_payment_id,
      referred_at
    )
    VALUES (
      ${normalizedPhoneNumber},
      ${params.phoneHash},
      ${params.displayName},
      ${params.handle},
      ${params.pinHash},
      ${params.walletAddress ?? null},
      NOW(),
      NULL,
      NULL,
      NULL,
      NULL
    )
    ON CONFLICT (phone_number)
    DO UPDATE SET
      phone_hash = EXCLUDED.phone_hash,
      display_name = EXCLUDED.display_name,
      trustlink_handle = EXCLUDED.trustlink_handle,
      pin_hash = EXCLUDED.pin_hash,
      wallet_address = COALESCE(EXCLUDED.wallet_address, users.wallet_address),
      phone_verified_at = COALESCE(users.phone_verified_at, NOW())
    RETURNING
      id,
      phone_number,
      phone_hash,
      display_name,
      trustlink_handle,
      pin_hash,
      wallet_address,
      receiver_autoclaim_enabled,
      whatsapp_opted_in,
      opt_in_timestamp,
      opt_out_timestamp,
      phone_verified_at,
      identity_verified_at,
      referred_by_user_id,
      referral_source_payment_id,
      referred_at,
      created_at
  `) as UserRecord[];

  return rows[0];
}

export async function ensureUserForPhoneNumber(params: {
  phoneNumber: string;
  phoneHash: string;
  displayName?: string;
  whatsappOptedIn?: boolean;
  optInTimestamp?: Date | null;
  phoneVerifiedAt?: Date | null;
}) {
  const normalizedPhoneNumber = normalizePhoneNumber(params.phoneNumber);
  const existingUser = await findUserByPhoneNumber(normalizedPhoneNumber);

  if (existingUser) {
    return existingUser;
  }

  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      return await insertUserProfile({
        phoneNumber: normalizedPhoneNumber,
        phoneHash: params.phoneHash,
        displayName: getSeedDisplayName(params.displayName) ?? "TrustLink User",
        handle: createGeneratedHandle(),
        pinHash: "",
        whatsappOptedIn: params.whatsappOptedIn,
        optInTimestamp: params.optInTimestamp,
        phoneVerifiedAt: params.phoneVerifiedAt,
      });
    } catch (error) {
      if (
        error instanceof Error &&
        /duplicate key|trustlink_handle|phone_number/i.test(error.message)
      ) {
        const user = await findUserByPhoneNumber(normalizedPhoneNumber);
        if (user) {
          return user;
        }
        continue;
      }

      throw error;
    }
  }

  throw new Error("Could not create user record");
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
      whatsapp_opted_in,
      opt_in_timestamp,
      opt_out_timestamp,
      phone_verified_at,
      identity_verified_at,
      referred_by_user_id,
      referral_source_payment_id,
      referred_at,
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
      whatsapp_opted_in,
      opt_in_timestamp,
      opt_out_timestamp,
      phone_verified_at,
      identity_verified_at,
      referred_by_user_id,
      referral_source_payment_id,
      referred_at,
      created_at
  `) as UserRecord[];

  return rows[0];
}

export async function updateUserDisplayName(params: {
  userId: string;
  displayName: string;
}) {
  const rows = (await sql`
    UPDATE users
    SET display_name = ${params.displayName}
    WHERE id = ${params.userId}
    RETURNING
      id,
      phone_number,
      phone_hash,
      display_name,
      trustlink_handle,
      pin_hash,
      wallet_address,
      whatsapp_opted_in,
      opt_in_timestamp,
      opt_out_timestamp,
      phone_verified_at,
      identity_verified_at,
      referred_by_user_id,
      referral_source_payment_id,
      referred_at,
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
  const normalizedPhoneNumber = normalizePhoneNumber(params.phoneNumber);
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
    WHERE phone_number = ${normalizedPhoneNumber}
    RETURNING
      id,
      phone_number,
      phone_hash,
      display_name,
      trustlink_handle,
      pin_hash,
      wallet_address,
      whatsapp_opted_in,
      opt_in_timestamp,
      opt_out_timestamp,
      phone_verified_at,
      identity_verified_at,
      referred_by_user_id,
      referral_source_payment_id,
      referred_at,
      created_at
  `) as UserRecord[];

  return rows[0];
}

export async function updateUserReceiverAutoclaimSetting(params: {
  userId: string;
  enabled: boolean;
}): Promise<UserRecord> {
  await ensureUserAutoclaimColumn();
  const rows = (await sql`
    UPDATE users
    SET receiver_autoclaim_enabled = ${params.enabled}
    WHERE id = ${params.userId}
    RETURNING
      id,
      phone_number,
      phone_hash,
      phone_identity_pubkey,
      privacy_view_pubkey,
      privacy_spend_pubkey,
      settlement_wallet_pubkey,
      recovery_wallet_pubkey,
      binding_signature,
      display_name,
      trustlink_handle,
      pin_hash,
      wallet_address,
      receiver_autoclaim_enabled,
      whatsapp_opted_in,
      opt_in_timestamp,
      opt_out_timestamp,
      phone_verified_at,
      identity_verified_at,
      referred_by_user_id,
      referral_source_payment_id,
      referred_at,
      created_at
  `) as UserRecord[];

  return rows[0];
}

export async function markUserWhatsAppOptIn(params: {
  phoneNumber: string;
  displayName?: string;
  phoneHash: string;
  optedInAt?: Date;
}) {
  const normalizedPhoneNumber = normalizePhoneNumber(params.phoneNumber);
  const optedInAt = params.optedInAt ?? new Date();
  const seedDisplayName = getSeedDisplayName(params.displayName);
  const user = await ensureUserForPhoneNumber({
    phoneNumber: normalizedPhoneNumber,
    phoneHash: params.phoneHash,
    displayName: seedDisplayName ?? undefined,
    whatsappOptedIn: true,
    optInTimestamp: optedInAt,
  });

  const rows = (await sql`
    UPDATE users
    SET
      display_name = CASE
        WHEN ${seedDisplayName ?? null} IS NOT NULL
          AND (
            display_name IS NULL
            OR BTRIM(display_name) = ''
            OR display_name = 'TrustLink User'
          )
        THEN ${seedDisplayName ?? null}
        ELSE display_name
      END,
      whatsapp_opted_in = true,
      opt_in_timestamp = ${optedInAt.toISOString()},
      opt_out_timestamp = NULL
    WHERE id = ${user.id}
    RETURNING
      id,
      phone_number,
      phone_hash,
      display_name,
      trustlink_handle,
      pin_hash,
      wallet_address,
      whatsapp_opted_in,
      opt_in_timestamp,
      opt_out_timestamp,
      phone_verified_at,
      identity_verified_at,
      referred_by_user_id,
      referral_source_payment_id,
      referred_at,
      created_at
  `) as UserRecord[];

  return rows[0];
}

export async function markUserWhatsAppOptOut(params: {
  phoneNumber: string;
  optedOutAt?: Date;
}) {
  const normalizedPhoneNumber = normalizePhoneNumber(params.phoneNumber);
  const optedOutAt = params.optedOutAt ?? new Date();
  const rows = (await sql`
    UPDATE users
    SET
      whatsapp_opted_in = false,
      opt_out_timestamp = ${optedOutAt.toISOString()}
    WHERE phone_number = ${normalizedPhoneNumber}
    RETURNING
      id,
      phone_number,
      phone_hash,
      display_name,
      trustlink_handle,
      pin_hash,
      wallet_address,
      whatsapp_opted_in,
      opt_in_timestamp,
      opt_out_timestamp,
      phone_verified_at,
      identity_verified_at,
      referred_by_user_id,
      referral_source_payment_id,
      referred_at,
      created_at
  `) as UserRecord[];

  return rows[0] ?? null;
}

export async function setUserReferralAttribution(params: {
  userId: string;
  referredByUserId: string;
  referralSourcePaymentId: string;
  referredAt?: Date;
}): Promise<UserRecord | null> {
  const referredAt = params.referredAt ?? new Date();
  const rows = (await sql`
    UPDATE users
    SET
      referred_by_user_id = COALESCE(referred_by_user_id, ${params.referredByUserId}),
      referral_source_payment_id = COALESCE(referral_source_payment_id, ${params.referralSourcePaymentId}),
      referred_at = COALESCE(referred_at, ${referredAt.toISOString()})
    WHERE id = ${params.userId}
    RETURNING
      id,
      phone_number,
      phone_hash,
      display_name,
      trustlink_handle,
      pin_hash,
      wallet_address,
      whatsapp_opted_in,
      opt_in_timestamp,
      opt_out_timestamp,
      phone_verified_at,
      identity_verified_at,
      referred_by_user_id,
      referral_source_payment_id,
      referred_at,
      created_at
  `) as UserRecord[];

  return rows[0] ?? null;
}

export async function getUserKeyMaterialById(userId: string): Promise<{
  id: string;
  phone_identity_pubkey: string | null;
  privacy_view_pubkey: string | null;
  privacy_spend_pubkey: string | null;
  settlement_wallet_pubkey: string | null;
  recovery_wallet_pubkey: string | null;
  binding_signature: string | null;
} | null> {
  const rows = (await sql`
    SELECT
      id,
      phone_identity_pubkey,
      privacy_view_pubkey,
      privacy_spend_pubkey,
      settlement_wallet_pubkey,
      recovery_wallet_pubkey,
      binding_signature
    FROM users
    WHERE id = ${userId}
    LIMIT 1
  `) as Array<{
    id: string;
    phone_identity_pubkey: string | null;
    privacy_view_pubkey: string | null;
    privacy_spend_pubkey: string | null;
    settlement_wallet_pubkey: string | null;
    recovery_wallet_pubkey: string | null;
    binding_signature: string | null;
  }>;

  return rows[0] ?? null;
}

export async function updateUserPublicKeyMaterial(params: {
  userId: string;
  phoneIdentityPublicKey: string;
  privacyViewPublicKey: string;
  privacySpendPublicKey: string;
  settlementWalletPublicKey: string;
  recoveryWalletPublicKey?: string | null;
  bindingSignature?: string | null;
}): Promise<{
  id: string;
  phone_identity_pubkey: string | null;
  privacy_view_pubkey: string | null;
  privacy_spend_pubkey: string | null;
  settlement_wallet_pubkey: string | null;
  recovery_wallet_pubkey: string | null;
  binding_signature: string | null;
}> {
  const rows = (await sql`
    UPDATE users
    SET
      phone_identity_pubkey = ${params.phoneIdentityPublicKey},
      privacy_view_pubkey = ${params.privacyViewPublicKey},
      privacy_spend_pubkey = ${params.privacySpendPublicKey},
      settlement_wallet_pubkey = ${params.settlementWalletPublicKey},
      recovery_wallet_pubkey = ${params.recoveryWalletPublicKey ?? null},
      binding_signature = ${params.bindingSignature ?? null}
    WHERE id = ${params.userId}
    RETURNING
      id,
      phone_identity_pubkey,
      privacy_view_pubkey,
      privacy_spend_pubkey,
      settlement_wallet_pubkey,
      recovery_wallet_pubkey,
      binding_signature
  `) as Array<{
    id: string;
    phone_identity_pubkey: string | null;
    privacy_view_pubkey: string | null;
    privacy_spend_pubkey: string | null;
    settlement_wallet_pubkey: string | null;
    recovery_wallet_pubkey: string | null;
    binding_signature: string | null;
  }>;

  return rows[0];
}

export async function ensureUserPhoneIdentityPublicKey(userId: string, existingPublicKey?: string | null) {
  if (existingPublicKey) {
    return existingPublicKey;
  }

  const generatedPublicKey = generatePhoneIdentityPublicKey();
  const rows = (await sql`
    UPDATE users
    SET phone_identity_pubkey = COALESCE(phone_identity_pubkey, ${generatedPublicKey})
    WHERE id = ${userId}
    RETURNING phone_identity_pubkey
  `) as Array<{ phone_identity_pubkey: string | null }>;

  const phoneIdentityPublicKey = rows[0]?.phone_identity_pubkey;
  if (!phoneIdentityPublicKey) {
    throw new Error("Could not assign a phone identity public key");
  }

  return phoneIdentityPublicKey;
}
