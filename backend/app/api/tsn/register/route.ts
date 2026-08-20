export const runtime = "nodejs";

import { upsertPaymentIntent } from "@/app/db/tsn";
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
    return ok({
      intentId: intent.id,
      // Claim work is created by the Receiver only after TSN Node verification
      // and a confirmed Cranker funding report.  Returning no claim id here
      // prevents the API from advertising an unverified settlement.
      settlementReference: null,
      status: "intent_registered_waiting_for_node_verification",
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
