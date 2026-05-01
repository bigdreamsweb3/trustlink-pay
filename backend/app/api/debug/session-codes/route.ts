import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/app/lib/logger";

export async function GET(request: NextRequest) {
  try {
    const { RedisSessionStorage } = await import("@/app/lib/redis");
    const sessions = await RedisSessionStorage.getAllSessions();
    const codes = Object.entries(sessions).map(([code, session]) => ({
      code,
      sessionId: session.sessionId,
      status: session.status,
      phoneNumber: session.phoneNumber,
      createdAt: new Date(session.createdAt).toISOString(),
      expiresAt: new Date(session.expiresAt).toISOString(),
      verifiedAt: session.verifiedAt ? new Date(session.verifiedAt).toISOString() : null,
      isExpired: new Date(session.expiresAt) < new Date(),
    }));

    logger.info("debug.session_codes.list", {
      totalCodes: codes.length,
      codes: codes.map(c => c.code),
    });

    return NextResponse.json({
      success: true,
      totalCodes: codes.length,
      codes,
    });
  } catch (error) {
    logger.error("debug.session_codes.error", {
      error: error instanceof Error ? error.message : "Unknown error",
    });

    return NextResponse.json(
      { error: "Failed to get session codes" },
      { status: 500 }
    );
  }
}
