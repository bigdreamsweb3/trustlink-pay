import { findUserByPhoneNumber } from "@/app/db/users";

export type PersistedUser = Awaited<ReturnType<typeof findUserByPhoneNumber>> extends infer T
  ? NonNullable<T>
  : never;

export function sanitizeUser(user: PersistedUser) {
  return {
    id: user.id,
    phoneNumber: user.phone_number,
    tin: user.tin,
    tinsIdentityPublicKey: user.tins_identity_pubkey,
    tinsRegistryPublicKey: user.tins_registry_pubkey,
    tinsWalletPublicKey: user.tins_wallet_pubkey,
    tinsProgramId: user.tins_program_id,
    tinsCreatedAt: user.tins_created_at,
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
