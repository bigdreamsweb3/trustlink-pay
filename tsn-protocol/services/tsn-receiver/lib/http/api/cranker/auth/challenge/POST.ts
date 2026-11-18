/** Request component: original validation, status mapping, privacy projection and errors are preserved. */
import type { NextRequest, NextResponse } from "next/server";
import type { issueCrankerChallenge } from "../../../../../cranker-auth";

import type { Dependencies } from "./dependencies";

export async function POST(dependencies: Pick<Dependencies, "NextResponse" | "issueCrankerChallenge">, request: NextRequest) {
    try {
        const body = await request.json() as {
            publicKey?: string;
        };
        const publicKey = body.publicKey?.trim() ?? "";
        if (!publicKey)
            return dependencies.NextResponse.json({ error: "publicKey is required" }, { status: 422 });
        return dependencies.NextResponse.json(await dependencies.issueCrankerChallenge(publicKey));
    }
    catch (error) {
        const message = error instanceof Error ? error.message : "ERROR";
        const status = message.startsWith("CRANKER_RPC_UNAVAILABLE") ? 503 : message.startsWith("CRANKER_") ? 403 : 400;
        return dependencies.NextResponse.json({ error: message }, { status });
    }
}
