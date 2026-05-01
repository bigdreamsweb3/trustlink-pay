import { logger } from "@/app/lib/logger";

// Store active connections for each session
const sessionConnections = new Map<string, Set<ReadableStreamDefaultController>>();

// Function to notify all clients for a session
export function notifySessionVerification(sessionId: string, data: any) {
  const connections = sessionConnections.get(sessionId);
  
  logger.info("sse.notification.attempt", {
    sessionId,
    connectionCount: connections?.size || 0,
    hasConnections: !!connections,
  });
  
  if (connections) {
    const message = `data: ${JSON.stringify({ type: "verified", ...data })}\n\n`;
    let sentCount = 0;
    
    connections.forEach(controller => {
      try {
        controller.enqueue(message);
        sentCount++;
      } catch (error) {
        // Connection might be closed, remove it
        connections.delete(controller);
        logger.warn("sse.connection.failed", { sessionId, error });
      }
    });
    
    logger.info("sse.notification.sent", {
      sessionId,
      sentCount,
      totalConnections: connections.size,
    });
  } else {
    logger.warn("sse.notification.no_connections", { sessionId });
  }
}

// Function to add a connection to the session
export function addSessionConnection(sessionId: string, controller: ReadableStreamDefaultController) {
  if (!sessionConnections.has(sessionId)) {
    sessionConnections.set(sessionId, new Set());
  }
  sessionConnections.get(sessionId)!.add(controller);
  
  logger.info("sse.connection.added", {
    sessionId,
    totalConnections: sessionConnections.get(sessionId)!.size,
  });
}

// Function to remove a connection from the session
export function removeSessionConnection(sessionId: string, controller: ReadableStreamDefaultController) {
  const connections = sessionConnections.get(sessionId);
  if (connections) {
    const sizeBefore = connections.size;
    connections.delete(controller);
    const sizeAfter = connections.size;
    
    logger.info("sse.connection.removed", {
      sessionId,
      sizeBefore,
      sizeAfter,
      remainingConnections: connections.size,
    });
    
    if (connections.size === 0) {
      sessionConnections.delete(sessionId);
      logger.info("sse.session.empty", { sessionId });
    }
  }
}

// Function to get connection count for a session
export function getSessionConnectionCount(sessionId: string): number {
  return sessionConnections.get(sessionId)?.size || 0;
}

// Debug: Log connection status every 30 seconds
setInterval(() => {
  const totalSessions = sessionConnections.size;
  const totalConnections = Array.from(sessionConnections.values()).reduce((sum, set) => sum + set.size, 0);
  
  logger.info("sse.status.snapshot", {
    totalSessions,
    totalConnections,
    activeSessions: Array.from(sessionConnections.keys()),
  });
}, 30000);
