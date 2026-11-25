import type { NextRequest } from "next/server";
import type { RelayRequest } from "../../node-relay/types";
export interface Dependencies { requireService: (request: NextRequest, actor: "node") => void; request: (request: RelayRequest, retryId?: string) => Promise<Response>; }
