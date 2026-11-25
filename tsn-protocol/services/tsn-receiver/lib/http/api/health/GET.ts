/** Request component: original validation, status mapping, privacy projection and errors are preserved. */
import type { NextResponse } from "next/server";
import type { db } from "../../../database";
import type { storage } from "./configuration";

import type { Dependencies } from "./dependencies";

export async function GET(dependencies: Pick<Dependencies, "NextResponse" | "db" | "storage">) {
    try {
        await dependencies.db.collection(process.env.TSN_RECEIVER_STATE_COLLECTION ?? "tsn_receiver_state")
            .limit(1)
            .get();
        return dependencies.NextResponse.json({ service: "TSN_RECEIVER", storage: dependencies.storage, status: "READY" });
    }
    catch (error) {
        console.error(`TSN Receiver ${dependencies.storage} health check failed`, error);
        const errorCode = typeof error === "object" && error !== null && "code" in error
            ? String((error as {
                code?: unknown;
            }).code ?? "STORAGE_ERROR")
            : "STORAGE_ERROR";
        return dependencies.NextResponse.json({
            service: "TSN_RECEIVER",
            storage: dependencies.storage,
            status: "DEGRADED",
            errorCode,
        }, { status: 503 });
    }
}
