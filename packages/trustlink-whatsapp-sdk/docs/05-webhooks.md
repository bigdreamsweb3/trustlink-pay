# Webhooks

The webhook module receives WhatsApp events from Meta.

It handles:

- inbound messages
- opt-in messages
- stop messages
- session-code messages
- session approval replies
- session decline replies
- delivery status updates

## Import

    import {
      processWhatsAppWebhookPayload,
      verifyWhatsAppSignature
    } from "trustlink-whatsapp-sdk/backend";

## Basic Webhook Route

    export async function POST(request: Request) {
      const rawBody = await request.text();
      const signature = request.headers.get("x-hub-signature-256");

      if (!verifyWhatsAppSignature(rawBody, signature)) {
        return new Response("Invalid signature", { status: 401 });
      }

      const payload = JSON.parse(rawBody);

      await processWhatsAppWebhookPayload(payload);

      return Response.json({ ok: true });
    }

## Signature Verification

The SDK verifies Meta webhook signatures with:

    verifyWhatsAppSignature(rawBody, signatureHeader)

The host app must pass the exact raw request body.

Do not parse JSON before signature verification.

## Inbound Message Flow

When WhatsApp sends an inbound message:

1. SDK normalizes the phone number.
2. SDK stores the webhook event through the webhookEvents port.
3. SDK checks if the message is STOP.
4. SDK checks if the message is START TRUSTLINK.
5. SDK checks if the message is a session approval or decline.
6. SDK checks if the message contains a TrustLink session code.
7. SDK updates the host app through configured ports.

## Opt-In Message

The opt-in message is:

    START TRUSTLINK

When received, the SDK calls:

    users.markOptIn
    phoneVerification.sendOtp

## Stop Message

The stop message is:

    STOP

When received, the SDK calls:

    users.markOptOut

## Session-Code Message

When the user sends a session code, the SDK calls:

    sessions.findSessionCode
    sendSessionReviewRequest
    sessions.markSessionAwaitingConfirmation

## Approval Message

When the user approves a session, the SDK calls:

    sessions.findPendingSessionForPhone
    sessions.verifySessionCode
    auth.issueChallengeToken
    auth.sanitizeUser
    auth.notifySessionVerification

## Decline Message

When the user declines a session, the SDK calls:

    sessions.findPendingSessionForPhone
    sessions.markSessionDeclined

Then the SDK sends a decline message back through WhatsApp.

## Delivery Status Events

When Meta sends message status updates, the SDK calls:

    payments.findByNotificationMessageId
    payments.findByNotificationMessageEventId
    payments.updateNotificationMessageId
    payments.updateNotificationStatus
    webhookEvents.create

## Important Rule

Webhook logic must stay server-side.

Frontend code must never process WhatsApp webhook payloads.
