export const runtime = "nodejs";

import { withAuthenticatedRoute } from "@/app/controllers/authenticated-route";
import { ok } from "@/app/lib/http";
import {
  contactSearchSchema,
  upsertContactSchema,
} from "@/app/lib/validation";
import {
  saveContactForUser,
  searchContactsForUser,
} from "@/app/services/contacts";

export async function GET(request: Request) {
  return withAuthenticatedRoute(request, async (authUser) => {
    const url = new URL(request.url);
    const payload = contactSearchSchema.parse({
      q: url.searchParams.get("q") ?? "",
    });
    const contacts = await searchContactsForUser({
      authUser,
      query: payload.q,
    });

    return ok({ contacts });
  });
}

export async function POST(request: Request) {
  return withAuthenticatedRoute(request, async (authUser) => {
    const payload = upsertContactSchema.parse(await request.json());
    const contact = await saveContactForUser({
      authUser,
      displayName: payload.displayName,
      phoneNumber: payload.phoneNumber ?? null,
      tin: payload.tin ?? null,
      trustlinkHandle: payload.trustlinkHandle ?? null,
      source: payload.source,
      markPaid: payload.markPaid,
    });

    return ok({ contact }, { status: 201 });
  });
}
