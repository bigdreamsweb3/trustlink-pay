# Backend Setup

The backend must configure the SDK before using backend features.

The SDK is standalone. It does not load your app database, auth system, logger, or environment by itself.

## Required Setup

Configure these once during backend startup:

1. SDK config
2. SDK logger
3. SDK ports

## Configure SDK Config

    import { configureWhatsAppSdkConfig } from "trustlink-whatsapp-sdk/backend";

    configureWhatsAppSdkConfig({
      AUTH_SESSION_CODE_TTL_MINUTES: 10,
      WHATSAPP_MOCK_MODE: false,
      WHATSAPP_BASE_URL: "https://graph.facebook.com",
      WHATSAPP_API_VERSION: "v20.0",
      WHATSAPP_PHONE_ID: process.env.WHATSAPP_PHONE_ID,
      WHATSAPP_API_KEY: process.env.WHATSAPP_API_KEY,
      WHATSAPP_APP_SECRET: process.env.WHATSAPP_APP_SECRET,
      TRUSTLINK_BUSINESS_NUMBER: process.env.TRUSTLINK_BUSINESS_NUMBER,
      TRUSTLINK_CLAIM_BASE_URL: "https://app.trustlinkpay.com/claim",
      WHATSAPP_USE_TEMPLATES: true,
      WHATSAPP_TEMPLATE_LANGUAGE_CODE: "en",
      WHATSAPP_PAYMENT_TEMPLATE_NAME: process.env.WHATSAPP_PAYMENT_TEMPLATE_NAME,
      WHATSAPP_OTP_TEMPLATE_NAME: process.env.WHATSAPP_OTP_TEMPLATE_NAME,
      WHATSAPP_SESSION_REVIEW_TEMPLATE_NAME: process.env.WHATSAPP_SESSION_REVIEW_TEMPLATE_NAME
    });

## Configure SDK Logger

    import { configureWhatsAppSdkLogger } from "trustlink-whatsapp-sdk/backend";

    configureWhatsAppSdkLogger({
      info(event, metadata) {
        logger.info(event, metadata);
      },
      warn(event, metadata) {
        logger.warn(event, metadata);
      },
      error(event, metadata) {
        logger.error(event, metadata);
      }
    });

## Configure SDK Ports

    import { configureWhatsAppSdkPorts } from "trustlink-whatsapp-sdk/backend";

    configureWhatsAppSdkPorts({
      users,
      payments,
      webhookEvents,
      sessions,
      auth,
      phoneVerification
    });

## What Ports Mean

users:
Connects the SDK to your user records.

payments:
Connects WhatsApp delivery status to payment records.

webhookEvents:
Stores inbound messages and delivery events.

sessions:
Finds and updates session-code records.

auth:
Issues login challenge tokens and notifies the waiting frontend session.

phoneVerification:
Starts OTP verification after WhatsApp opt-in.

## Backend Rule

Backend code may import:

    trustlink-whatsapp-sdk/backend

The SDK package must not import your app paths like:

    "@/app/lib/env"
    "@/app/lib/logger"
    "@/app/db/users"
