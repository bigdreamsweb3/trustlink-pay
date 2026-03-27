import { NextResponse } from "next/server";
import { ZodError } from "zod";

export function ok<T>(data: T, init?: ResponseInit) {
  return NextResponse.json(data, init);
}

export function fail(message: string, status = 400, details?: unknown) {
  return NextResponse.json({ error: message, details }, { status });
}

export function toErrorResponse(error: unknown) {
  if (error instanceof ZodError) {
    const firstPath = error.issues[0]?.path?.[0];
    const isRequestBodyError = typeof firstPath === "string" && ["phoneNumber", "otp", "paymentId", "walletAddress", "receiverWalletId", "displayName", "handle", "pin", "challengeToken", "amount", "token", "tokenMintAddress", "escrowVaultAddress", "senderWallet", "senderPhoneNumber", "purpose"].includes(firstPath);
    return fail(isRequestBodyError ? "Invalid request body" : "Server configuration error", isRequestBodyError ? 400 : 500, error.flatten());
  }

  if (error instanceof Error) {
    if (/database connection unavailable|error connecting to database|fetch failed/i.test(error.message)) {
      return fail("Database connection unavailable", 503);
    }

    return fail(error.message, 400);
  }

  return fail("Unexpected server error", 500);
}
