import { cleanupExpiredSessionCodes } from "@/app/lib/session-codes";
import { logger } from "@/app/lib/logger";

/**
 * Cleanup service for expired session codes
 */
export class SessionCleanupService {
  private cleanupInterval: NodeJS.Timeout | null = null;
  private readonly CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

  start() {
    if (this.cleanupInterval) {
      return;
    }

    logger.info("session_cleanup.service_started");

    // Run cleanup immediately on start
    this.runCleanup();

    // Schedule regular cleanup
    this.cleanupInterval = setInterval(() => {
      this.runCleanup();
    }, this.CLEANUP_INTERVAL_MS);
  }

  stop() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
      logger.info("session_cleanup.service_stopped");
    }
  }

  private async runCleanup() {
    try {
      const cleanedCount = cleanupExpiredSessionCodes();
      
      if (cleanedCount > 0) {
        logger.info("session_cleanup.completed", { cleanedCount });
      }
    } catch (error) {
      logger.error("session_cleanup.error", {
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }
}

// Singleton instance
export const sessionCleanupService = new SessionCleanupService();
