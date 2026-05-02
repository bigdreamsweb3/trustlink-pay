import { NextRequest, NextResponse } from "next/server";

import { createSessionCode, getSessionCodeBySessionId } from "@/app/lib/session-codes";
import { logger } from "@/app/lib/logger";
import { addCorsHeaders, handleCors } from "@/app/lib/cors";

export async function POST(request: NextRequest) {
  // Handle CORS preflight
  const corsResponse = handleCors(request);
  if (corsResponse) return corsResponse;

  try {
    const body = await request.json();
    const { sessionId, device, location, requestedAt } = body;

    if (!sessionId) {
      const response = NextResponse.json(
        { error: "Session ID is required" },
        { status: 400 }
      );
      return addCorsHeaders(response, request.headers.get("origin"));
    }

    // Check if there's already a pending session code for this session
    const existingCode = await getSessionCodeBySessionId(sessionId);
    if (existingCode) {
      logger.info("auth.session.existing_code", {
        sessionId,
        code: existingCode.code,
        expiresAt: existingCode.expiresAt.toISOString(),
      });

      const response = NextResponse.json({
        success: true,
        sessionCode: existingCode.code,
        expiresAt: existingCode.expiresAt.toISOString(),
      });
      return addCorsHeaders(response, request.headers.get("origin"));
    }

    // Create new session code
    logger.info("auth.session.creating", { sessionId });
    const sessionCode = await createSessionCode(sessionId, {
      device: typeof device === "string" ? device : undefined,
      location: typeof location === "string" ? location : undefined,
      requestedAt: typeof requestedAt === "string" ? requestedAt : undefined,
    });

    logger.info("auth.session.created", {
      sessionId,
      code: sessionCode.code,
      expiresAt: sessionCode.expiresAt.toISOString(),
    });

    const response = NextResponse.json({
      success: true,
      sessionCode: sessionCode.code,
      expiresAt: sessionCode.expiresAt.toISOString(),
    });
    return addCorsHeaders(response, request.headers.get("origin"));
  } catch (error) {
    logger.error("auth.session.error", {
      error: error instanceof Error ? error.message : "Unknown error",
    });

    const response = NextResponse.json(
      { error: "Failed to create session code" },
      { status: 500 }
    );
    return addCorsHeaders(response, request.headers.get("origin"));
  }
}

export async function GET(request: NextRequest) {
  // Handle CORS preflight
  const corsResponse = handleCors(request);
  if (corsResponse) return corsResponse;

  const { searchParams } = new URL(request.url);
  const sessionId = searchParams.get("sessionId");

  if (!sessionId) {
    const response = NextResponse.json(
      { error: "Session ID is required" },
      { status: 400 }
    );
    return addCorsHeaders(response, request.headers.get("origin"));
  }

  try {
    const sessionCode = await getSessionCodeBySessionId(sessionId);

    if (!sessionCode) {
      const response = NextResponse.json({
        success: false,
        message: "No active session code found",
      });
      return addCorsHeaders(response, request.headers.get("origin"));
    }

    const response = NextResponse.json({
      success: true,
      sessionCode: sessionCode.code,
      status: sessionCode.status,
      expiresAt: sessionCode.expiresAt.toISOString(),
    });
    return addCorsHeaders(response, request.headers.get("origin"));
  } catch (error) {
    logger.error("auth.session.get_error", {
      sessionId,
      error: error instanceof Error ? error.message : "Unknown error",
    });

    const response = NextResponse.json(
      { error: "Failed to get session code" },
      { status: 500 }
    );
    return addCorsHeaders(response, request.headers.get("origin"));
  }
}
