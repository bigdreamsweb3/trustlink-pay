import { NextRequest } from "next/server";
import { proxyNode } from "../../lib/node-proxy";

export const runtime = "nodejs";

// TIN operation intents are validated and queued by the TSN Node.  The
// Receiver is the public Firebase-backed ingress, so keep this hop here
// rather than exposing a second queue implementation.
export async function GET(request: NextRequest) {
  return proxyNode(request, "tin-operations");
}

export async function POST(request: NextRequest) {
  return proxyNode(request, "tin-operations");
}
