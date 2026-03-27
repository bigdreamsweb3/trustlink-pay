export const runtime = "nodejs";

import { requireAuthenticatedUser } from "@/app/lib/auth";
import { fail, ok, toErrorResponse } from "@/app/lib/http";
import { deleteReceiverWalletForUser } from "@/app/services/auth";

export async function DELETE(request: Request, context: { params: Promise<{ walletId: string }> }) {
  try {
    const authUser = requireAuthenticatedUser(request);
    const { walletId } = await context.params;
    const wallet = await deleteReceiverWalletForUser(authUser, walletId);

    return ok({ wallet });
  } catch (error) {
    if (error instanceof Error && /access token/i.test(error.message)) {
      return fail(error.message, 401);
    }

    return toErrorResponse(error);
  }
}
