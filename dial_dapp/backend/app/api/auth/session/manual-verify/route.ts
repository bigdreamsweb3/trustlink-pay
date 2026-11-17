import { NextRequest, NextResponse } from "next/server";

import { verifySessionCode, manualVerifySessionCode } from "@/app/lib/session-codes";
import { findUserByPhoneNumber } from "@/app/db/users";
import { issueAuthChallengeToken } from "@/app/lib/auth";
import { logger } from "@/app/lib/logger";
import { sanitizeUser } from "@/app/services/auth/shared";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { sessionCode, phoneNumber } = body;

    if (!sessionCode) {
      return NextResponse.json(
        { error: "Session code is required" },
        { status: 400 }
      );
    }

    logger.info("auth.manual_verify.attempt", {
      sessionCode,
      phoneNumber,
    });

    // Verify the session code using manual verification (phoneNumber is optional)
    const verifiedSession = await manualVerifySessionCode(sessionCode, phoneNumber);
    
    if (!verifiedSession) {
      logger.warn("auth.manual_verify.failed", {
        sessionCode,
        phoneNumber,
      });
      return NextResponse.json({
        success: false,
        error: "Invalid or expired session code",
      });
    }

    logger.info("auth.manual_verify.success", {
      sessionCode,
      phoneNumber,
      sessionId: verifiedSession.sessionId,
    });

    // Find user - use phone number from session if not provided
    const userPhoneNumber = phoneNumber || verifiedSession.phoneNumber;
    let user = await findUserByPhoneNumber(userPhoneNumber);
    
    if (!user) {
      logger.warn("auth.manual_verify.user_not_found", {
        phoneNumber: userPhoneNumber,
      });
      return NextResponse.json({
        success: false,
        error: "User not found. Please complete the WhatsApp opt-in first.",
      });
    }

    // Issue auth challenge token
    const challengeToken = issueAuthChallengeToken({
      id: user.id,
      phoneNumber: user.phone_number,
      stage: user.pin_hash ? "pin_verify" : "pin_setup",
    });

    logger.info("auth.manual_verify.completed", {
      sessionId: verifiedSession.sessionId,
      userId: user.id,
      phoneNumber,
      stage: user.pin_hash ? "pin_verify" : "pin_setup",
    });

    return NextResponse.json({
      success: true,
      challengeToken,
      user: sanitizeUser(user),
      stage: user.pin_hash ? "pin_verify" : "pin_setup",
    });
  } catch (error) {
    logger.error("auth.manual_verify.error", {
      error: error instanceof Error ? error.message : "Unknown error",
    });

    return NextResponse.json(
      { error: "Failed to verify session" },
      { status: 500 }
    );
  }
}
