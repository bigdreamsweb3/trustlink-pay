export const runtime = "nodejs";

import { toErrorResponse, ok } from "@/app/lib/http";

/**
 * Request claim via TSN
 */
export async function POST(request: Request) {
  try {
    return ok({
      message: "Claim request submitted to TSN",
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
