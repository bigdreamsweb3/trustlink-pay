import { NextRequest } from "next/server";

// Store active connections for each session
const sessionConnections = new Map<string, Set<ReadableStreamDefaultController>>();

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const sessionId = searchParams.get("sessionId");

  if (!sessionId) {
    return new Response("Session ID required", { status: 400 });
  }

  // Create a new stream for Server-Sent Events
  const stream = new ReadableStream({
    start(controller) {
      // Add this connection to the session's connection set
      if (!sessionConnections.has(sessionId)) {
        sessionConnections.set(sessionId, new Set());
      }
      sessionConnections.get(sessionId)!.add(controller);

      // Send initial connection event
      controller.enqueue(`data: ${JSON.stringify({ type: "connected" })}\n\n`);

      // Cleanup on disconnect
      request.signal.addEventListener("abort", () => {
        const connections = sessionConnections.get(sessionId);
        if (connections) {
          connections.delete(controller);
          if (connections.size === 0) {
            sessionConnections.delete(sessionId);
          }
        }
        controller.close();
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    },
  });
}

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
