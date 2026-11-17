export const runtime = "nodejs";

import { withAuthenticatedRoute } from "@/app/controllers/authenticated-route";
import { ok } from "@/app/lib/http";
import { requestRecoverySchema } from "@/app/lib/validation";
import { prepareRecoveryRequestForUser } from "@/app/services/identity-binding";

export async function POST(request: Request) {
  return withAuthenticatedRoute(request, async (authUser) => {
    const body = await request.json();
    const payload = requestRecoverySchema.parse(body);
    const result = await prepareRecoveryRequestForUser(authUser, payload);

    return ok(result);
  });
}
