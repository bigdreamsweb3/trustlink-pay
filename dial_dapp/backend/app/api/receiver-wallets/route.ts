export const runtime = "nodejs";

import { withAuthenticatedRoute } from "@/app/controllers/authenticated-route";
import { CACHE_TAGS, CACHE_TTL_SECONDS, cachedQuery, invalidateUserCache } from "@/app/lib/cache";
import { ok } from "@/app/lib/http";
import { addReceiverWalletSchema } from "@/app/lib/validation";
import { addReceiverWalletForUser, listReceiverWalletsForUser } from "@/app/services/auth";

const getCachedReceiverWallets = cachedQuery(
  "receiver-wallets-v1",
  (userId: string, phoneNumber: string) => listReceiverWalletsForUser({ id: userId, phoneNumber }),
  {
    revalidate: CACHE_TTL_SECONDS.identity,
    tags: [CACHE_TAGS.identity],
  },
);

export async function GET(request: Request) {
  return withAuthenticatedRoute(request, async (authUser) => {
    const wallets = await getCachedReceiverWallets(authUser.id, authUser.phoneNumber);

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
    invalidateUserCache(authUser.id);

    return ok(
      {
        wallet
      },
      { status: 201 }
    );
  });
}
