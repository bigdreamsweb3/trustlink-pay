export const runtime = "nodejs";

import { NextResponse } from "next/server";

import { env } from "@/app/lib/env";
import { fail } from "@/app/lib/http";
import { logger } from "@/app/lib/logger";
import { processWhatsAppWebhookPayload, verifyWhatsAppSignature } from "@/app/services/whatsapp-webhook";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  if (mode === "subscribe" && token === env.WHATSAPP_WEBHOOK_VERIFY_TOKEN && challenge) {
    logger.info("whatsapp.webhook.verified");
    return new NextResponse(challenge, { status: 200 });
  }

  logger.warn("whatsapp.webhook.verification_failed", {
    mode
  });
  return fail("Webhook verification failed", 403);
}

export async function POST(request: Request) {
  const rawBody = await request.text();
  const signatureHeader = request.headers.get("x-hub-signature-256");

  if (!verifyWhatsAppSignature(rawBody, signatureHeader)) {
    logger.warn("whatsapp.webhook.invalid_signature");
    return fail("Invalid webhook signature", 401);
  }

  try {
    const payload = JSON.parse(rawBody) as Parameters<typeof processWhatsAppWebhookPayload>[0];
    await processWhatsAppWebhookPayload(payload);
    return NextResponse.json({ received: true });
  } catch (error) {
    logger.error("whatsapp.webhook.processing_failed", {
      error: error instanceof Error ? error.message : "Unknown error"
    });
    return fail("Unable to process webhook payload", 500);
  }
}
