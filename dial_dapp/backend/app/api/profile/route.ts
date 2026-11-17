export const runtime = "nodejs";

import { withAuthenticatedRoute } from "@/app/controllers/authenticated-route";
import { ok } from "@/app/lib/http";
import { updateProfileSchema } from "@/app/lib/validation";
import { updateProfileForUser } from "@/app/services/auth";

export async function PATCH(request: Request) {
  return withAuthenticatedRoute(request, async (authUser) => {
    const body = await request.json();
    const payload = updateProfileSchema.parse(body);
    const user = await updateProfileForUser(authUser, payload);

    return ok({
      user
    });
  });
}
