export const runtime = "nodejs";

import { withAuthenticatedRoute } from "@/app/controllers/authenticated-route";
import { fail, ok, toErrorResponse } from "@/app/lib/http";
import { identityKeyRegistrationSchema } from "@/app/lib/validation";
import {
  getIdentitySecurityForUser,
  registerIdentityKeysForUser,
} from "@/app/services/identity-binding";

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

export async function POST(request: Request) {
  return withAuthenticatedRoute(request, async (authUser) => {
    try {
      const body = await request.json();
      const payload = identityKeyRegistrationSchema.parse(body);
      const result = await registerIdentityKeysForUser(authUser, payload);

      return ok({
        phoneIdentityPublicKey: result.phoneIdentityPublicKey,
        privacyViewPublicKey: result.privacyViewPublicKey,
        privacySpendPublicKey: result.privacySpendPublicKey,
        settlementWalletPublicKey: result.settlementWalletPublicKey,
        recoveryWalletPublicKey: result.recoveryWalletPublicKey,
        bindingSignature: result.bindingSignature,
      });
    } catch (error) {
      if (error instanceof Error) {
        return fail(error.message, 400);
      }

      return toErrorResponse(error);
    }
  });
}
