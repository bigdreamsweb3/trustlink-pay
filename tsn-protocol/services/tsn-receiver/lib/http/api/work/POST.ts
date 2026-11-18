/** Request component: original validation, status mapping, privacy projection and errors are preserved. */
import type { NextRequest, NextResponse } from "next/server";
import type { listRecent, receive } from "../../../store";
import type { assertExternalWorkKind, publicCoordinationPayload, ReceiverWork, WorkKind } from "../../../work-contract";

import type { Dependencies } from "./dependencies";

export async function POST(dependencies: Pick<Dependencies, "NextResponse" | "assertExternalWorkKind" | "publicCoordinationPayload" | "receive">, request: NextRequest) {
    try {
        const body = await request.json() as {
            id?: string;
            kind?: WorkKind;
            payload?: Record<string, unknown>;
        };
        if (!body.kind || !body.payload)
            return dependencies.NextResponse.json({ error: "kind and payload are required" }, { status: 422 });
        dependencies.assertExternalWorkKind(body.kind);
        const work = await dependencies.receive({ id: body.id, kind: body.kind, payload: body.payload });
        return dependencies.NextResponse.json({ id: work.id, kind: work.kind, status: work.status, stateVersion: work.stateVersion,
            payloadCommitment: work.payloadCommitment, payload: dependencies.publicCoordinationPayload(work),
            receivedAt: work.receivedAt, updatedAt: work.updatedAt }, { status: 201 });
    }
    catch (error) {
        const message = error instanceof Error ? error.message : "RECEIVER_ERROR";
        return dependencies.NextResponse.json({ error: message }, { status: message === "IDEMPOTENCY_CONFLICT" ? 409 : 400 });
    }
}
