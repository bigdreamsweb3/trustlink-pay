export const runtime = "nodejs";

import { withAuthenticatedRoute } from "@/app/controllers/authenticated-route";
import { ok, toErrorResponse } from "@/app/lib/http";
import { identityKeyRegistrationSchema } from "@/app/lib/validation";
import {
  confirmIdentityKeyRegistrationForUser,
  prepareIdentityKeyRegistrationForUser,
} from "@/app/services/identity-binding";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const payload = identityKeyRegistrationSchema.parse(body);

    return withAuthenticatedRoute(request, async (authUser) => {
      if (!payload.blockchainSignature) {
        const result = await prepareIdentityKeyRegistrationForUser(authUser, payload);
        return ok(result);
      }

      const result = await confirmIdentityKeyRegistrationForUser(authUser, payload);
      return ok(result, { status: 201 });
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
