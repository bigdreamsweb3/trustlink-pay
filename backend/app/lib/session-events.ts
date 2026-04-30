// Store active connections for each session
const sessionConnections = new Map<string, Set<ReadableStreamDefaultController>>();

// Function to notify all clients for a session
export function notifySessionVerification(sessionId: string, data: any) {
  const connections = sessionConnections.get(sessionId);
  if (connections) {
    const message = `data: ${JSON.stringify({ type: "verified", ...data })}\n\n`;
    connections.forEach(controller => {
      try {
        controller.enqueue(message);
      } catch (error) {
        // Connection might be closed, remove it
        connections.delete(controller);
      }
    });
  }
}

// Function to add a connection to the session
export function addSessionConnection(sessionId: string, controller: ReadableStreamDefaultController) {
  if (!sessionConnections.has(sessionId)) {
    sessionConnections.set(sessionId, new Set());
  }
  sessionConnections.get(sessionId)!.add(controller);
}

// Function to remove a connection from the session
export function removeSessionConnection(sessionId: string, controller: ReadableStreamDefaultController) {
  const connections = sessionConnections.get(sessionId);
  if (connections) {
    connections.delete(controller);
    if (connections.size === 0) {
      sessionConnections.delete(sessionId);
    }
  }
}

// Function to get connection count for a session
export function getSessionConnectionCount(sessionId: string): number {
  return sessionConnections.get(sessionId)?.size || 0;
}
