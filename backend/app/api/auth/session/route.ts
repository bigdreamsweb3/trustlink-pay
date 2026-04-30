import { NextRequest, NextResponse } from "next/server";

import { createSessionCode, getSessionCodeBySessionId } from "@/app/lib/session-codes";
import { logger } from "@/app/lib/logger";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { sessionId } = body;

    if (!sessionId) {
      return NextResponse.json(
        { error: "Session ID is required" },
        { status: 400 }
      );
    }

    // Check if there's already a pending session code for this session
    const existingCode = getSessionCodeBySessionId(sessionId);
    if (existingCode) {
      logger.info("auth.session.existing_code", {
        sessionId,
        code: existingCode.code,
        expiresAt: existingCode.expiresAt.toISOString(),
      });

      return NextResponse.json({
        success: true,
        sessionCode: existingCode.code,
        expiresAt: existingCode.expiresAt.toISOString(),
      });
    }

    // Create new session code
    const sessionCode = createSessionCode(sessionId);

    logger.info("auth.session.created", {
      sessionId,
      code: sessionCode.code,
      expiresAt: sessionCode.expiresAt.toISOString(),
    });

    return NextResponse.json({
      success: true,
      sessionCode: sessionCode.code,
      expiresAt: sessionCode.expiresAt.toISOString(),
    });
  } catch (error) {
    logger.error("auth.session.error", {
      error: error instanceof Error ? error.message : "Unknown error",
    });

    return NextResponse.json(
      { error: "Failed to create session code" },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const sessionId = searchParams.get("sessionId");

  if (!sessionId) {
    return NextResponse.json(
      { error: "Session ID is required" },
      { status: 400 }
    );
  }

  try {
    const sessionCode = getSessionCodeBySessionId(sessionId);

    if (!sessionCode) {
      return NextResponse.json({
        success: false,
        message: "No active session code found",
      });
    }

    return NextResponse.json({
      success: true,
      sessionCode: sessionCode.code,
      status: sessionCode.status,
      expiresAt: sessionCode.expiresAt.toISOString(),
    });
  } catch (error) {
    logger.error("auth.session.get_error", {
      sessionId,
      error: error instanceof Error ? error.message : "Unknown error",
    });

    return NextResponse.json(
      { error: "Failed to get session code" },
      { status: 500 }
    );
  }
}
