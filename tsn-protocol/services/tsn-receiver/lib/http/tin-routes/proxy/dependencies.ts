import type { NextRequest } from "next/server";
import type { proxyNode } from "../../../node-proxy";
/** Narrow request ports; the route composition owns their real implementations. */
export interface Dependencies {
  proxyNode: typeof proxyNode;
}
