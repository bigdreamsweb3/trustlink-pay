export const runtime = "nodejs";

import { requireAuthenticatedUser } from "@/app/lib/auth";
import { fail, ok, toErrorResponse } from "@/app/lib/http";
import { addReceiverWalletSchema } from "@/app/lib/validation";
import { addReceiverWalletForUser, listReceiverWalletsForUser } from "@/app/services/auth";

export async function GET(request: Request) {
  try {
    const authUser = requireAuthenticatedUser(request);
    const wallets = await listReceiverWalletsForUser(authUser);

    return ok({
      wallets
    });
  } catch (error) {
    if (error instanceof Error && /access token/i.test(error.message)) {
      return fail(error.message, 401);
    }

    return toErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const authUser = requireAuthenticatedUser(request);
    const body = await request.json();
    const payload = addReceiverWalletSchema.parse(body);
    const wallet = await addReceiverWalletForUser(authUser, payload);

    return ok(
      {
        wallet
      },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof Error && /access token/i.test(error.message)) {
      return fail(error.message, 401);
    }

    return toErrorResponse(error);
  }
}
