# Messaging

The messaging module sends WhatsApp messages through the configured WhatsApp Business API account.

It supports:

- payment notifications
- payment retry messages
- payment claimed messages
- refund pending messages
- OTP messages
- auth OTP messages
- session review requests
- invalid session messages
- approved session messages
- declined session messages
- welcome messages

## Import

    import {
      sendPaymentNotification,
      sendWhatsAppOtp,
      sendAuthOtp,
      sendSessionReviewRequest,
      sendInvalidSessionMessage,
      sendSessionApprovedMessage,
      sendSessionDeclinedMessage
    } from "trustlink-whatsapp-sdk/backend";

## Send A Payment Notification

    await sendPaymentNotification({
      phoneNumber: "+2348000000000",
      amount: 100,
      token: "USDC",
      paymentId: "pay_123",
      senderDisplayName: "Daniel",
      senderHandle: "bigdreams",
      referenceCode: "TL-123456"
    });

## Send An OTP

    await sendWhatsAppOtp("+2348000000000", "123456");

## Send An Auth OTP

    await sendAuthOtp("+2348000000000", "123456");

## Send A Session Review Request

    await sendSessionReviewRequest({
      phoneNumber: "+2348000000000",
      sessionCode: "TLSA1B2C3",
      device: "Chrome on Windows",
      location: "Lagos, Nigeria",
      requestedAt: "July 11, 2026, 10:30 AM",
      expiresIn: "10 minutes"
    });

## Send Session Result Messages

    await sendSessionApprovedMessage("+2348000000000");

    await sendSessionDeclinedMessage("+2348000000000");

    await sendInvalidSessionMessage("+2348000000000");

## Opt-In Rules

The SDK checks opt-in before sending most notifications.

A user is eligible for notification messages when the configured users port says the user has opted in or has verified their phone.

Auth messages can bypass normal opt-in only when the SDK function explicitly marks the message as auth-related.

## Template Messages

If template mode is enabled, the SDK uses configured WhatsApp template names.

Relevant config fields:

    WHATSAPP_USE_TEMPLATES
    WHATSAPP_TEMPLATE_LANGUAGE_CODE
    WHATSAPP_PAYMENT_TEMPLATE_NAME
    WHATSAPP_OTP_TEMPLATE_NAME
    WHATSAPP_SESSION_REVIEW_TEMPLATE_NAME

If a template is not configured for a supported flow, the SDK uses a text-message fallback.

## Required Config

Messaging requires:

    WHATSAPP_BASE_URL
    WHATSAPP_API_VERSION
    WHATSAPP_PHONE_ID
    WHATSAPP_API_KEY
    TRUSTLINK_CLAIM_BASE_URL

## Message Delivery Status

Meta sends delivery status later through webhooks.

The SDK updates payment records through the payments port when those status events arrive.
