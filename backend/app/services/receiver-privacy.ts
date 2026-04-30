import type { ensureUserForPhoneNumber } from "@/app/db/users";

type BasicUser = NonNullable<Awaited<ReturnType<typeof ensureUserForPhoneNumber>>>;

export async function ensureReceiverPrivacyRoot(user: BasicUser) {
  if (!user.privacy_spend_pubkey) {
    throw new Error("Privacy spend public key has not been registered for this user");
  }

  return {
    publicKey: user.privacy_spend_pubkey,
  };
}
