import Redis from 'ioredis';
import { logger } from '@/app/lib/logger';
import { env } from "@/app/lib/env";

// Redis client configuration
const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
const redis = new Redis(redisUrl);

// Redis connection events
redis.on('connect', () => {
  logger.info('redis.connected', { url: redisUrl });
});

redis.on('error', (error) => {
  logger.error('redis.error', { error: error.message, url: redisUrl });
});

redis.on('close', () => {
  logger.warn('redis.closed', { url: redisUrl });
});

// Session storage keys
const SESSION_KEY_PREFIX = 'session:';
const SESSION_EXPIRY_SECONDS = env.AUTH_SESSION_CODE_TTL_MINUTES * 60;

export { redis };

export class RedisSessionStorage {
  /**
   * Store a session code in Redis
   */
  static async setSession(code: string, sessionData: any): Promise<void> {
    try {
      const key = `${SESSION_KEY_PREFIX}${code}`;
      await redis.setex(key, SESSION_EXPIRY_SECONDS, JSON.stringify(sessionData));
      
      logger.info('redis.session.set', {
        code,
        sessionId: sessionData.sessionId,
        expiresInSeconds: SESSION_EXPIRY_SECONDS,
      });
    } catch (error) {
      logger.error('redis.session.set.error', {
        code,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Get a session code from Redis
   */
  static async getSession(code: string): Promise<any | null> {
    try {
      const key = `${SESSION_KEY_PREFIX}${code}`;
      const data = await redis.get(key);
      
      if (!data) {
        logger.warn('redis.session.not_found', { code });
        return null;
      }

      const sessionData = JSON.parse(data);
      
      // Check if expired (additional safety check)
      const now = new Date();
      const expiresAt = new Date(sessionData.expiresAt);
      
      if (expiresAt < now) {
        logger.warn('redis.session.expired', {
          code,
          expiresAt: expiresAt.toISOString(),
          now: now.toISOString(),
        });
        await this.deleteSession(code);
        return null;
      }

      logger.info('redis.session.found', {
        code,
        sessionId: sessionData.sessionId,
        status: sessionData.status,
      });

      return sessionData;
    } catch (error) {
      logger.error('redis.session.get.error', {
        code,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return null;
    }
  }

  /**
   * Delete a session code from Redis
   */
  static async deleteSession(code: string): Promise<void> {
    try {
      const key = `${SESSION_KEY_PREFIX}${code}`;
      await redis.del(key);
      
      logger.info('redis.session.deleted', { code });
    } catch (error) {
      logger.error('redis.session.delete.error', {
        code,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Update a session code in Redis
   */
  static async updateSession(code: string, updates: Partial<any>): Promise<void> {
    try {
      const existingSession = await this.getSession(code);
      if (!existingSession) {
        throw new Error(`Session ${code} not found for update`);
      }

      const updatedSession = { ...existingSession, ...updates };
      await this.setSession(code, updatedSession);
      
      logger.info('redis.session.updated', {
        code,
        sessionId: updatedSession.sessionId,
        updates: Object.keys(updates),
      });
    } catch (error) {
      logger.error('redis.session.update.error', {
        code,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Get all active session codes (for debugging)
   */
  static async getAllSessions(): Promise<Record<string, any>> {
    try {
      const keys = await redis.keys(`${SESSION_KEY_PREFIX}*`);
      const sessions: Record<string, any> = {};

      for (const key of keys) {
        const code = key.replace(SESSION_KEY_PREFIX, '');
        const data = await redis.get(key);
        if (data) {
          sessions[code] = JSON.parse(data);
        }
      }

      logger.info('redis.session.all_sessions', {
        totalSessions: Object.keys(sessions).length,
        codes: Object.keys(sessions),
      });

      return sessions;
    } catch (error) {
      logger.error('redis.session.get_all.error', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return {};
    }
  }

  /**
   * Clean up expired sessions
   */
  static async cleanupExpiredSessions(): Promise<number> {
    try {
      const sessions = await this.getAllSessions();
      const now = new Date();
      let cleanedCount = 0;

      for (const [code, session] of Object.entries(sessions)) {
        const expiresAt = new Date(session.expiresAt);
        if (expiresAt < now) {
          await this.deleteSession(code);
          cleanedCount++;
        }
      }

      logger.info('redis.session.cleanup_completed', {
        cleanedCount,
        totalBefore: Object.keys(sessions).length,
        totalAfter: Object.keys(sessions).length - cleanedCount,
      });

      return cleanedCount;
    } catch (error) {
      logger.error('redis.session.cleanup.error', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return 0;
    }
  }

  /**
   * Close Redis connection
   */
  static async disconnect(): Promise<void> {
    try {
      await redis.quit();
      logger.info('redis.disconnected');
    } catch (error) {
      logger.error('redis.disconnect.error', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
}
