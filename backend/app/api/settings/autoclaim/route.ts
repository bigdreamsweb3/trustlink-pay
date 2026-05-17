export const runtime = "nodejs";

import { withAuthenticatedRoute } from "@/app/controllers/authenticated-route";
import { getEscrowPolicyConfig } from "@/app/config/escrow";
import { updatePaymentsReceiverAutoclaimAllowed } from "@/app/db/payments";
import { findUserById, updateUserReceiverAutoclaimSetting } from "@/app/db/users";
import { CACHE_TAGS, CACHE_TTL_SECONDS, cachedQuery, invalidatePaymentCache, invalidateUserCache } from "@/app/lib/cache";
import { ok } from "@/app/lib/http";
import { updateAutoclaimSettingsSchema } from "@/app/lib/validation";
import { AutoclaimEngine } from "@/app/services/payments/autoclaim-engine";

const getCachedAutoclaimSettings = cachedQuery(
  "autoclaim-settings-v1",
  async (userId: string) => {
    const user = await findUserById(userId);
    if (!user) {
      throw new Error("Account not found");
    }

    return {
      enabled: user.receiver_autoclaim_enabled ?? false,
      maxAmountUsd: getEscrowPolicyConfig().autoclaimMaxUsd,
    };
  },
  {
    revalidate: CACHE_TTL_SECONDS.identity,
    tags: [CACHE_TAGS.identity],
  },
);

export async function GET(request: Request) {
  return withAuthenticatedRoute(request, async (authUser) => {
    return ok(await getCachedAutoclaimSettings(authUser.id));
  });
}

export async function PATCH(request: Request) {
  return withAuthenticatedRoute(request, async (authUser) => {
    const body = await request.json();
    const payload = updateAutoclaimSettingsSchema.parse(body);

    const user = await updateUserReceiverAutoclaimSetting({
      userId: authUser.id,
      enabled: payload.enabled,
    });

    await updatePaymentsReceiverAutoclaimAllowed({
      receiverPhone: user.phone_number,
      enabled: payload.enabled,
    });
    invalidateUserCache(authUser.id);
    invalidatePaymentCache();

    if (payload.enabled) {
      await AutoclaimEngine.triggerReceiverOnboarded({
        receiverPhone: user.phone_number,
        triggerSource: "receiver.settings_enabled",
      });
    }

    return ok({
      enabled: user.receiver_autoclaim_enabled ?? false,
      maxAmountUsd: getEscrowPolicyConfig().autoclaimMaxUsd,
    });
  });
}
