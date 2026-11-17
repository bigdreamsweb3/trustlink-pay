import { NextRequest, NextResponse } from "next/server";

import { findSessionCode } from "@/app/lib/session-codes";
import { findUserByPhoneNumber } from "@/app/db/users";
import { issueAuthChallengeToken } from "@/app/lib/auth";
import { logger } from "@/app/lib/logger";
import { sanitizeUser } from "@/app/services/auth/shared";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { sessionId, sessionCode } = body;

    if (!sessionId || !sessionCode) {
      return NextResponse.json(
        { error: "Session ID and session code are required" },
        { status: 400 }
      );
    }

    // Find and verify the session code
    const session = await findSessionCode(sessionCode);
    
    if (!session) {
      return NextResponse.json({
        success: false,
        error: "Invalid or expired session code",
      });
    }

    if (session.sessionId !== sessionId) {
      return NextResponse.json({
        success: false,
        error: "Session mismatch",
      });
    }

    if (session.status === "declined") {
      return NextResponse.json({
        success: false,
        error: "Session was declined",
      });
    }

    if (session.status !== "verified") {
      return NextResponse.json({
        success: false,
        error: "Session not yet verified",
      });
    }

    if (!session.phoneNumber) {
      return NextResponse.json({
        success: false,
        error: "Session verification incomplete",
      });
    }

    // Find the user
    const user = await findUserByPhoneNumber(session.phoneNumber);
    
    if (!user) {
      return NextResponse.json({
        success: false,
        error: "User not found",
      });
    }

    // Issue auth challenge token
    const challengeToken = issueAuthChallengeToken({
      id: user.id,
      phoneNumber: user.phone_number,
      stage: user.pin_hash ? "pin_verify" : "pin_setup",
    });

    logger.info("auth.session.verification_completed", {
      sessionId,
      sessionCode,
      userId: user.id,
      phoneNumber: session.phoneNumber,
      stage: user.pin_hash ? "pin_verify" : "pin_setup",
    });

    return NextResponse.json({
      success: true,
      challengeToken,
      user: sanitizeUser(user),
      stage: user.pin_hash ? "pin_verify" : "pin_setup",
    });
  } catch (error) {
    logger.error("auth.session.verify_error", {
      error: error instanceof Error ? error.message : "Unknown error",
    });

    return NextResponse.json(
      { error: "Failed to verify session" },
      { status: 500 }
    );
  }
}
