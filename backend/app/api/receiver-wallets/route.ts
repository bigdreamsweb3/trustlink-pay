export const runtime = "nodejs";

import { withAuthenticatedRoute } from "@/app/controllers/authenticated-route";
import { ok } from "@/app/lib/http";
import { addReceiverWalletSchema } from "@/app/lib/validation";
import { addReceiverWalletForUser, listReceiverWalletsForUser } from "@/app/services/auth";

export async function GET(request: Request) {
  return withAuthenticatedRoute(request, async (authUser) => {
    const wallets = await listReceiverWalletsForUser(authUser);

    return ok({
      wallets
    });
  });
}

export async function POST(request: Request) {
  return withAuthenticatedRoute(request, async (authUser) => {
    const body = await request.json();
    const payload = addReceiverWalletSchema.parse(body);
    const wallet = await addReceiverWalletForUser(authUser, payload);

    return ok(
      {
        wallet
      },
      { status: 201 }
    );
  });
}
