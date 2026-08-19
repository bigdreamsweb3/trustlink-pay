import { NextRequest, NextResponse } from "next/server";
import { receive } from "../../lib/store";

export const runtime = "nodejs";

/** Receiver ingress for recovery work. Payload must already contain only public,
 * immutable account and amount fields; secret route material is rejected by receive(). */
export async function POST(request: NextRequest) {
  return NextResponse.json({ error: "RECOVERY_DISABLED_DNA_EPOCH_REIMBURSEMENT" }, { status: 410 });
  /* Legacy ingress retained only as an explicit tombstone. */
  /*
  try {
    const payload = await request.json() as Record<string, unknown>;
    const id = String(payload.id ?? "").trim();
    if (!id || !payload.paymentId || !payload.recoveryAmountBaseUnits) {
      return NextResponse.json({ error: "id, paymentId, and recoveryAmountBaseUnits are required" }, { status: 422 });
    }
    return NextResponse.json(await receive({ id, kind: "RECOVERY", payload }), { status: 202 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "RECEIVER_ERROR" }, { status: 400 });
  }
  */
}
