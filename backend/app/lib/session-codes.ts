import { randomBytes } from "node:crypto";

import { logger } from "@/app/lib/logger";
import { RedisSessionStorage } from "@/app/lib/redis";

export interface SessionCode {
  code: string;
  sessionId: string;
  phoneNumber?: string;
  status: "pending" | "verified" | "expired";
  expiresAt: Date;
  createdAt: Date;
  verifiedAt?: Date;
}

const SESSION_CODE_PREFIX = "TL";
const SESSION_CODE_LENGTH = 6;
const SESSION_EXPIRY_MINUTES = 10;

/**
 * Generate a unique session code in format TLXXXXXX
 */
export function generateSessionCode(): string {
  const randomPart = randomBytes(3).toString("hex").toUpperCase().slice(0, SESSION_CODE_LENGTH);
  return `${SESSION_CODE_PREFIX}${randomPart}`;
}

/**
 * Create a new session code for authentication
 */
export async function createSessionCode(sessionId: string): Promise<SessionCode> {
  const code = generateSessionCode();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_EXPIRY_MINUTES * 60 * 1000);
  
  const sessionCode: SessionCode = {
    code,
    sessionId,
    status: "pending",
    expiresAt,
    createdAt: now,
  };
  
  try {
    await RedisSessionStorage.setSession(code, sessionCode);
    
    logger.info("session_code.created", {
      code,
      sessionId,
      expiresAt: expiresAt.toISOString(),
    });
    
    return sessionCode;
  } catch (error) {
    logger.error("session_code.create.error", {
      code,
      sessionId,
      error: error instanceof Error ? error.message : "Unknown error",
    });
    throw error;
  }
}

/**
 * Find a session code by its value
 */
export async function findSessionCode(code: string): Promise<SessionCode | null> {
  try {
    const sessionCode = await RedisSessionStorage.getSession(code);
    
    logger.info("session_code.find_debug", {
      lookingFor: code,
      found: !!sessionCode,
    });
    
    if (!sessionCode) {
      logger.warn("session_code.not_found", { code });
      return null;
    }
    
    // Convert date strings back to Date objects
    const sessionCodeWithDates: SessionCode = {
      ...sessionCode,
      expiresAt: new Date(sessionCode.expiresAt),
      createdAt: new Date(sessionCode.createdAt),
      verifiedAt: sessionCode.verifiedAt ? new Date(sessionCode.verifiedAt) : undefined,
    };
    
    logger.info("session_code.found", { 
      code, 
      sessionId: sessionCodeWithDates.sessionId,
      status: sessionCodeWithDates.status,
      expiresAt: sessionCodeWithDates.expiresAt.toISOString()
    });
    
    // Check if expired
    const now = new Date();
    if (sessionCodeWithDates.expiresAt < now) {
      logger.warn("session_code.expired", { 
        code, 
        expiresAt: sessionCodeWithDates.expiresAt.toISOString(),
        now: now.toISOString(),
        expired: sessionCodeWithDates.expiresAt < now
      });
      sessionCodeWithDates.status = "expired";
      await RedisSessionStorage.deleteSession(code);
      return null;
    }
    
    return sessionCodeWithDates;
  } catch (error) {
    logger.error("session_code.find.error", {
      code,
      error: error instanceof Error ? error.message : "Unknown error",
    });
    return null;
  }
}

/**
 * Verify and mark a session code as verified
 */
export async function verifySessionCode(code: string, phoneNumber: string): Promise<SessionCode | null> {
  const sessionCode = await findSessionCode(code);
  
  if (!sessionCode) {
    return null;
  }
  
  if (sessionCode.status !== "pending" && sessionCode.status !== "verified") {
    return null;
  }
  
  // If already verified, don't update again
  if (sessionCode.status === "verified") {
    logger.info("session_code.already_verified", {
      code,
      sessionId: sessionCode.sessionId,
      verifiedAt: sessionCode.verifiedAt?.toISOString(),
    });
    return sessionCode;
  }
  
  // Update session code with verification details
  const updatedSessionCode = {
    ...sessionCode,
    phoneNumber,
    status: "verified" as const,
    verifiedAt: new Date(),
  };
  
  // Update in Redis
  await RedisSessionStorage.updateSession(code, updatedSessionCode);
  
  logger.info("session_code.verified", {
    code,
    sessionId: updatedSessionCode.sessionId,
    phoneNumber,
    verifiedAt: updatedSessionCode.verifiedAt.toISOString(),
  });
  
  return updatedSessionCode;
}

/**
 * Manual verification of session code (allows pending status)
 */
export async function manualVerifySessionCode(code: string, phoneNumber?: string): Promise<SessionCode | null> {
  const sessionCode = await findSessionCode(code);
  
  if (!sessionCode) {
    return null;
  }
  
  // For manual verification, allow both pending and verified status
  if (sessionCode.status !== "pending" && sessionCode.status !== "verified") {
    return null;
  }
  
  // Update session code with verification details
  const updatedSessionCode = {
    ...sessionCode,
    phoneNumber: phoneNumber || sessionCode.phoneNumber,
    status: "verified" as const,
    verifiedAt: sessionCode.verifiedAt || new Date(),
  };
  
  // Update in Redis
  await RedisSessionStorage.updateSession(code, updatedSessionCode);
  
  logger.info("session_code.manual_verified", {
    code,
    sessionId: updatedSessionCode.sessionId,
    phoneNumber: updatedSessionCode.phoneNumber,
    verifiedAt: updatedSessionCode.verifiedAt.toISOString(),
  });
  
  return updatedSessionCode;
}

/**
 * Clean up expired session codes
 */
export async function cleanupExpiredSessionCodes(): Promise<number> {
  try {
    const cleanedCount = await RedisSessionStorage.cleanupExpiredSessions();
    return cleanedCount;
  } catch (error) {
    logger.error("session_code.cleanup.error", {
      error: error instanceof Error ? error.message : "Unknown error",
    });
    return 0;
  }
}

/**
 * Get session code by session ID
 */
export async function getSessionCodeBySessionId(sessionId: string): Promise<SessionCode | null> {
  try {
    const sessions = await RedisSessionStorage.getAllSessions();
    
    for (const [code, sessionData] of Object.entries(sessions)) {
      if (sessionData.sessionId === sessionId && sessionData.status === "pending") {
        return await findSessionCode(code);
      }
    }
    
    return null;
  } catch (error) {
    logger.error("session_code.get_by_session_id.error", {
      sessionId,
      error: error instanceof Error ? error.message : "Unknown error",
    });
    return null;
  }
}

// Auto-cleanup expired codes every 5 minutes
setInterval(cleanupExpiredSessionCodes, 5 * 60 * 1000);
