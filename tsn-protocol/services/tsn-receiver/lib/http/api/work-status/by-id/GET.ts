/** Request component: original validation, status mapping, privacy projection and errors are preserved. */
import type { NextRequest, NextResponse } from "next/server";
import type { createHash } from "node:crypto";
import type { getWork } from "../../../../store";
type Context = {
    params: Promise<{
        id: string;
    }>;
};
import type { Dependencies } from "./dependencies";
import { publicFundingReadiness } from "../../../../contracts/projection/public-funding-readiness";
import { canReplaceTinDebit } from "../../../../contracts/recovery/can-replace-tin-debit";

export async function GET(dependencies: Pick<Dependencies, "NextResponse" | "createHash" | "getWork">, _request: NextRequest, context: Context) {
    const { id } = await context.params;
    const work = await dependencies.getWork(id);
    if (!work) {
        return dependencies.NextResponse.json({ error: "RECEIVER_WORK_NOT_FOUND" }, { status: 404 });
    }
    if (work.kind === "AUTHORIZED_FUNDING") {
        const settlementId = `settlement-${dependencies.createHash("sha256").update(`${work.id}:${work.payloadCommitment}`).digest("hex").slice(0, 32)}`;
        const settlement = await dependencies.getWork(settlementId);
        return dependencies.NextResponse.json({
            operationId: work.id,
            kind: work.kind,
            status: work.status,
            ...publicFundingReadiness(work),
            receivedAt: work.receivedAt,
            updatedAt: work.updatedAt,
            verificationType: work.verification?.verificationType ?? null,
            nodeDecisionReason: work.status === "REJECTED" ? work.verification?.reason ?? null : null,
            result: work.result ? { signature: work.result.signature ?? null, stage: work.result.stage ?? null } : null,
            settlement: settlement ? {
                operationId: settlement.id,
                status: settlement.status,
                verificationType: settlement.verification?.verificationType ?? null,
                nodeDecisionReason: settlement.status === "REJECTED" ? settlement.verification?.reason ?? null : null,
                result: settlement.result ? { signature: settlement.result.signature ?? null, stage: settlement.result.stage ?? null } : null,
            } : null,
        }, { headers: { "cache-control": "no-store" } });
    }
    if (work.kind !== "TIN_OPERATION" && work.kind !== "TIN_DEBIT") {
        return dependencies.NextResponse.json({ error: "WORK_STATUS_UNSUPPORTED" }, { status: 404 });
    }
    return dependencies.NextResponse.json({
        operationId: work.id,
        kind: work.kind,
        status: work.status,
        receivedAt: work.receivedAt,
        updatedAt: work.updatedAt,
        verificationType: work.verification?.verificationType ?? null,
        ...(work.kind === "TIN_DEBIT" ? { safeToReplace: work.id === id && canReplaceTinDebit(work) } : {}),
        result: work.result ? {
            signature: work.result.signature ?? null,
            stage: work.result.stage ?? null,
        } : null,
    }, { headers: { "cache-control": "no-store" } });
}
