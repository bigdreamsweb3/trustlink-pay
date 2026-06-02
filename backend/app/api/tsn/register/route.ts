export const runtime = "nodejs";

import { createClaimRequest, findLatestActiveClaimRequestByPaymentId, upsertPaymentIntent } from "@/app/db/tsn";
import { toErrorResponse, ok } from "@/app/lib/http";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const paymentId = String(body?.paymentId ?? "");
    const intentId = String(body?.intentId ?? paymentId);
    const intentSeedHash = String(body?.intentSeedHash ?? "");
    const recipientHash = String(body?.recipientHash ?? "");
    const tokenMintAddress = body?.tokenMintAddress == null ? null : String(body.tokenMintAddress);
    const amount = Number(body?.amount ?? 0);
    const destinationWallet = String(body?.destinationWallet ?? "");
    const autoclaim = body?.autoclaim == null ? true : Boolean(body.autoclaim);

    if (!paymentId || !intentSeedHash || !recipientHash || !tokenMintAddress || !Number.isFinite(amount) || amount <= 0 || !destinationWallet) {
      throw new Error("Invalid TSN register payload");
    }

    const intent = await upsertPaymentIntent({
      id: intentId,
      paymentId,
      intentSeedHash,
      recipientHash,
      tokenMintAddress,
      amount,
    });
    const existingClaimRequest = await findLatestActiveClaimRequestByPaymentId(paymentId);
    const claimRequest =
      existingClaimRequest ??
      (await createClaimRequest({
        paymentId,
        intentId: intent.id,
        recipientHash,
        destinationWallet,
        autoclaim,
      }));

    return ok({
      intentId: intent.id,
      claimRequestId: claimRequest.id,
      status: "intent_and_claim_registered",
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
