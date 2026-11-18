/** Request component: original validation, status mapping, privacy projection and errors are preserved. */
import type { NextRequest, NextResponse } from "next/server";
import type { issueCrankerSession } from "../../../../../cranker-auth";

import type { Dependencies } from "./dependencies";

export async function POST(dependencies: Pick<Dependencies, "NextResponse" | "issueCrankerSession">, request: NextRequest) {
    try {
        const body = await request.json() as {
            publicKey?: string;
            nonce?: string;
            timestamp?: string;
            signature?: string;
        };
        const session = await dependencies.issueCrankerSession({
            publicKey: body.publicKey?.trim() ?? "",
            nonce: body.nonce?.trim() ?? "",
            timestamp: body.timestamp?.trim() ?? "",
            signature: body.signature?.trim() ?? "",
        });
        return dependencies.NextResponse.json(session, { headers: { "cache-control": "no-store" } });
    }
    catch (error) {
        const message = error instanceof Error ? error.message : "ERROR";
        const status = message.startsWith("CRANKER_") ? 401 : 400;
        return dependencies.NextResponse.json({ error: message }, { status, headers: { "cache-control": "no-store" } });
    }
}
