export const runtime = "nodejs";

import { z } from "zod";

import { ok, toErrorResponse } from "@/app/lib/http";
import { issueDeviceRegistrationChallenge } from "@/app/services/tsn-privacy/device-registration-challenge";

const requestSchema = z.object({
  tin: z.string().regex(/^\d+$/, "TIN must contain digits only"),
});

export async function POST(request: Request) {
  try {
    const payload = requestSchema.parse(await request.json());
    const challenge = await issueDeviceRegistrationChallenge({
      tin: payload.tin,
      network: process.env.TSN_NETWORK ?? "devnet",
      audience: new URL(request.url).origin,
    });
    return ok(challenge, { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
