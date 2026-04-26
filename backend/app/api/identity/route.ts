export const runtime = "nodejs";

import { withAuthenticatedRoute } from "@/app/controllers/authenticated-route";
import { ok } from "@/app/lib/http";
import { getIdentitySecurityForUser } from "@/app/services/identity-binding";

export async function GET(request: Request) {
  return withAuthenticatedRoute(request, async (authUser) => {
    const result = await getIdentitySecurityForUser(authUser);

    return ok({
      identity: result.binding,
    });
  });
}
