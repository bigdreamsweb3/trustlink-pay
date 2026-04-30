import { NextRequest, NextResponse } from "next/server";
import { addSessionConnection, removeSessionConnection } from "@/app/lib/session-events";
import { addCorsHeaders, handleCors } from "@/app/lib/cors";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  // Handle CORS preflight
  const corsResponse = handleCors(request);
  if (corsResponse) return corsResponse;

  const { searchParams } = new URL(request.url);
  const sessionId = searchParams.get("sessionId");

  if (!sessionId) {
    const response = new NextResponse("Session ID required", { status: 400 });
    return addCorsHeaders(response, request.headers.get("origin"));
  }

  // Create a new stream for Server-Sent Events
  const stream = new ReadableStream({
    start(controller) {
      // Add this connection to the session's connection set
      addSessionConnection(sessionId, controller);

      // Send initial connection event
      controller.enqueue(`data: ${JSON.stringify({ type: "connected" })}\n\n`);

      // Cleanup on disconnect
      request.signal.addEventListener("abort", () => {
        removeSessionConnection(sessionId, controller);
        controller.close();
      });
    },
  });

  const response = new NextResponse(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    },
  });
  return addCorsHeaders(response, request.headers.get("origin"));
}
