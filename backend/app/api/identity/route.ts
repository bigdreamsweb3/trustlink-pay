export const runtime = "nodejs";

import { withAuthenticatedRoute } from "@/app/controllers/authenticated-route";
import { ok } from "@/app/lib/http";
import { getIdentitySecurityForUser } from "@/app/services/identity-binding";

export async function GET(request: Request) {
  return withAuthenticatedRoute(request, async (authUser) => {
    const result = await getIdentitySecurityForUser(authUser);

    return ok({
      phoneIdentityPublicKey: result.phoneIdentity?.publicKey ?? null,
      privacyViewPublicKey: result.privacy?.viewPublicKey ?? null,
      privacySpendPublicKey: result.privacy?.spendPublicKey ?? null,
      settlementWalletPublicKey: result.user.settlement_wallet_pubkey ?? null,
      recoveryWalletPublicKey: result.user.recovery_wallet_pubkey ?? null,
      receiverAutoclaimEnabled: result.user.receiver_autoclaim_enabled ?? false,
      identity: result.binding,
    });
  });
}
