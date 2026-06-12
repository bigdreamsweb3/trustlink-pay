export const runtime = "nodejs";

import { withAuthenticatedRoute } from "@/app/controllers/authenticated-route";
import { ok } from "@/app/lib/http";
import { pinChallengeSchema } from "@/app/lib/validation";
import { startUserPinChallenge } from "@/app/services/auth";

export async function POST(request: Request) {
  return withAuthenticatedRoute(request, async (authUser) => {
    const body = await request.json().catch(() => ({}));
    pinChallengeSchema.parse(body);
    const result = await startUserPinChallenge(authUser);

    return ok(result);
  });
}
