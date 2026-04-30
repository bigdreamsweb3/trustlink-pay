import type { ensureUserForPhoneNumber } from "@/app/db/users";

type BasicUser = NonNullable<Awaited<ReturnType<typeof ensureUserForPhoneNumber>>>;

export async function ensureUserPhoneIdentity(user: BasicUser) {
  if (!user.phone_identity_pubkey) {
    throw new Error("Phone identity public key has not been registered for this user");
  }

  return {
    publicKey: user.phone_identity_pubkey,
  };
}
