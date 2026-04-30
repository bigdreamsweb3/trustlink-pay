export const runtime = "nodejs";

import { withAuthenticatedRoute } from "@/app/controllers/authenticated-route";
import { getEscrowPolicyConfig } from "@/app/config/escrow";
import { updatePaymentsReceiverAutoclaimAllowed } from "@/app/db/payments";
import { findUserById, updateUserReceiverAutoclaimSetting } from "@/app/db/users";
import { ok } from "@/app/lib/http";
import { updateAutoclaimSettingsSchema } from "@/app/lib/validation";
import { AutoclaimEngine } from "@/app/services/payments/autoclaim-engine";

export async function GET(request: Request) {
  return withAuthenticatedRoute(request, async (authUser) => {
    const user = await findUserById(authUser.id);
    if (!user) {
      throw new Error("Account not found");
    }

    return ok({
      enabled: user.receiver_autoclaim_enabled ?? false,
      maxAmountUsd: getEscrowPolicyConfig().autoclaimMaxUsd,
    });
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
