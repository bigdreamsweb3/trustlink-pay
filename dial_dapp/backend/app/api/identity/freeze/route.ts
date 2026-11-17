export const runtime = "nodejs";

import { withAuthenticatedRoute } from "@/app/controllers/authenticated-route";
import { ok } from "@/app/lib/http";
import { setIdentityFreezeSchema } from "@/app/lib/validation";
import { prepareFreezeIdentityForUser } from "@/app/services/identity-binding";

export async function POST(request: Request) {
  return withAuthenticatedRoute(request, async (authUser) => {
    const body = await request.json();
    const payload = setIdentityFreezeSchema.parse(body);
    const result = await prepareFreezeIdentityForUser(authUser, payload);

    return ok(result);
  });
}
