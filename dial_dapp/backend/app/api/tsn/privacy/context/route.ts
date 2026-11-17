export const runtime = "nodejs";

import { ok } from "@/app/lib/http";

export async function GET(request: Request) {
  return ok({ audience: new URL(request.url).origin });
}
