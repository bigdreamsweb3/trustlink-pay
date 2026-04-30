import { randomBytes } from "node:crypto";

import { logger } from "@/app/lib/logger";

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

// In-memory storage for session codes (replace with Redis/DB in production)
const sessionCodes = new Map<string, SessionCode>();

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
export function createSessionCode(sessionId: string): SessionCode {
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
  
  sessionCodes.set(code, sessionCode);
  
  logger.info("session_code.created", {
    code,
    sessionId,
    expiresAt: expiresAt.toISOString(),
  });
  
  return sessionCode;
}

/**
 * Find a session code by its value
 */
export function findSessionCode(code: string): SessionCode | null {
  const sessionCode = sessionCodes.get(code);
  
  if (!sessionCode) {
    return null;
  }
  
  // Check if expired
  if (sessionCode.expiresAt < new Date()) {
    sessionCode.status = "expired";
    sessionCodes.delete(code);
    return null;
  }
  
  return sessionCode;
}

/**
 * Verify and mark a session code as verified
 */
export function verifySessionCode(code: string, phoneNumber: string): SessionCode | null {
  const sessionCode = findSessionCode(code);
  
  if (!sessionCode) {
    return null;
  }
  
  if (sessionCode.status !== "pending") {
    return null;
  }
  
  sessionCode.phoneNumber = phoneNumber;
  sessionCode.status = "verified";
  sessionCode.verifiedAt = new Date();
  
  logger.info("session_code.verified", {
    code,
    sessionId: sessionCode.sessionId,
    phoneNumber,
    verifiedAt: sessionCode.verifiedAt.toISOString(),
  });
  
  return sessionCode;
}

/**
 * Clean up expired session codes
 */
export function cleanupExpiredSessionCodes(): number {
  const now = new Date();
  let cleanedCount = 0;
  
  for (const [code, sessionCode] of sessionCodes.entries()) {
    if (sessionCode.expiresAt < now) {
      sessionCode.status = "expired";
      sessionCodes.delete(code);
      cleanedCount++;
    }
  }
  
  if (cleanedCount > 0) {
    logger.info("session_code.cleanup", { cleanedCount });
  }
  
  return cleanedCount;
}

/**
 * Get session code by session ID
 */
export function getSessionCodeBySessionId(sessionId: string): SessionCode | null {
  for (const sessionCode of sessionCodes.values()) {
    if (sessionCode.sessionId === sessionId && sessionCode.status === "pending") {
      return findSessionCode(sessionCode.code);
    }
  }
  return null;
}

// Auto-cleanup expired codes every 5 minutes
setInterval(cleanupExpiredSessionCodes, 5 * 60 * 1000);
