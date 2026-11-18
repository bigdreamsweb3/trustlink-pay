/** Request component: original validation, status mapping, privacy projection and errors are preserved. */
import type { NextRequest, NextResponse } from "next/server";
import type { requireService } from "../../auth";
import type { publicIntent } from "../../public-view";
import type { listKind, receive } from "../../store";

import type { Dependencies } from "./dependencies";

export async function POST(dependencies: Pick<Dependencies, "NextResponse" | "assertPaymentAuthorizationIngress" | "publicIntent" | "receive" | "requireService">, request: NextRequest) {
    try {
        dependencies.requireService(request, "node");
        const payload = await request.json() as Record<string, unknown>;
        const id = String(payload.paymentId ?? "");
        if (!id)
            return dependencies.NextResponse.json({ error: "paymentId is required" }, { status: 422 });
        dependencies.assertPaymentAuthorizationIngress(payload);
        return dependencies.NextResponse.json(dependencies.publicIntent(await dependencies.receive({ id, kind: "AUTHORIZED_FUNDING", payload })), { status: 202 });
    }
    catch (error) {
        const message = error instanceof Error ? error.message : "RECEIVER_ERROR";
        return dependencies.NextResponse.json({ error: message }, { status: message === "IDEMPOTENCY_CONFLICT" ? 409 : 400 });
    }
}
