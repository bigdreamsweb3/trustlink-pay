export const runtime = "nodejs";

import { withAuthenticatedRoute } from "@/app/controllers/authenticated-route";
import { ok } from "@/app/lib/http";
import { removeContactForUser } from "@/app/services/contacts";

export async function DELETE(
  request: Request,
  { params }: { params: { contactId: string } },
) {
  return withAuthenticatedRoute(request, async (authUser) => {
    const contact = await removeContactForUser({
      authUser,
      contactId: params.contactId,
    });

    return ok({ contact });
  });
}
