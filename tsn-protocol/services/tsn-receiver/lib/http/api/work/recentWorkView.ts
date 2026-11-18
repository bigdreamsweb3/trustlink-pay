/** Request component: original validation, status mapping, privacy projection and errors are preserved. */
import type { NextRequest, NextResponse } from "next/server";
import type { listRecent, receive } from "../../../store";
import type { assertExternalWorkKind, publicCoordinationPayload, ReceiverWork, WorkKind } from "../../../work-contract";


export function recentWorkView(item: ReceiverWork) {
    return ({
        id: item.id,
        kind: item.kind,
        status: item.status,
        stateVersion: item.stateVersion,
        payloadCommitment: item.payloadCommitment,
        receivedAt: item.receivedAt,
        updatedAt: item.updatedAt,
        verification: item.verification
            ? {
                verificationType: item.verification.verificationType ?? "TSN_NODE",
                // Rejection diagnostics are deliberately limited to the Node's
                // bounded reason string. Never expose the verified payload or
                // signed/encrypted fields through this monitoring endpoint.
                reason: item.status === "REJECTED" && typeof item.verification.reason === "string"
                    ? item.verification.reason.slice(0, 500)
                    : null,
            }
            : null,
        result: item.result
            ? {
                signature: item.result.signature ?? null,
                stage: item.result.stage ?? null,
                reason: item.result.reason ?? null,
            }
            : null,
    });
}
