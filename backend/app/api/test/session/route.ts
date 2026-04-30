import { NextRequest, NextResponse } from "next/server";

import { verifySessionCode, createSessionCode } from "@/app/lib/session-codes";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, code, phoneNumber, sessionId } = body;

    if (action === "create") {
      const session = createSessionCode(sessionId || "test-session");
      return NextResponse.json({
        success: true,
        sessionCode: session.code,
        sessionId: session.sessionId,
        expiresAt: session.expiresAt,
      });
    }

    if (action === "verify") {
      const verified = verifySessionCode(code, phoneNumber || "+1234567890");
      return NextResponse.json({
        success: !!verified,
        session: verified,
      });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
