import type { NextRequest } from "next/server";
import type { SignedFundingAttachment } from "../../../../../../work-contract";
import type { Dependencies } from "./dependencies";

/** Accept an owner-authorized deposit only through authenticated Node coordination. */
export async function POST(dependencies: Dependencies, request: NextRequest) {
  try {
    dependencies.requireService(request, "node");
    const body = await request.json() as SignedFundingAttachment;
    const work = await dependencies.attachSignedFunding(body);
    return dependencies.NextResponse.json({ work }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "FUNDING_ATTACHMENT_FAILED";
    const status = message === "UNAUTHORIZED_SERVICE" ? 401 : message === "WORK_NOT_FOUND" ? 404 : 409;
    return dependencies.NextResponse.json({ error: message }, { status });
  }
}
