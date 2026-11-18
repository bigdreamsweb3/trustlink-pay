/** Request component: original validation, status mapping, privacy projection and errors are preserved. */
import type { NextRequest, NextResponse } from "next/server";
import type { receive } from "../../store";
import type { publicCoordinationPayload } from "../../work-contract";

import type { Dependencies } from "./dependencies";

export async function POST(dependencies: Pick<Dependencies, "NextResponse" | "publicCoordinationPayload" | "receive">, request: NextRequest) {
    try {
        const payload = await request.json() as Record<string, unknown>;
        const work = await dependencies.receive({ kind: "TIN_OPERATION", payload });
        return dependencies.NextResponse.json({
            intentId: String(payload.intentId ?? payload.ownerIntentHash ?? work.id),
            operationId: work.id,
            kind: work.kind,
            status: work.status,
            stateVersion: work.stateVersion,
            payloadCommitment: work.payloadCommitment,
            payload: dependencies.publicCoordinationPayload(work),
            receivedAt: work.receivedAt,
            updatedAt: work.updatedAt,
        }, { status: 201 });
    }
    catch (error) {
        const message = error instanceof Error ? error.message : "RECEIVER_ERROR";
        return dependencies.NextResponse.json({ error: message }, { status: message === "IDEMPOTENCY_CONFLICT" ? 409 : 400 });
    }
}
