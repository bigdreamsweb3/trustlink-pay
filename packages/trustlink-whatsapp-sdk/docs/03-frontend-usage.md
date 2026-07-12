# Frontend Usage

Frontend code uses the SDK for WhatsApp links, QR flows, device detection, and UI helpers.

The frontend must not use backend SDK exports.

## Main Import

Use this when you want most frontend helpers:

    import {
      buildTrustLinkWhatsAppWebUrl,
      buildTrustLinkWhatsAppNativeUrl,
      WhatsAppModal,
      WhatsAppIcon
    } from "trustlink-whatsapp-sdk";

## Focused Imports

Use focused imports when a file only needs one area:

    import { WhatsAppModal } from "trustlink-whatsapp-sdk/ui";
    import { buildTrustLinkWhatsAppWebUrl } from "trustlink-whatsapp-sdk/auth";
    import { detectWhatsAppDevice } from "trustlink-whatsapp-sdk/utils/device-detection";

## Build A WhatsApp Web Link

    const url = buildTrustLinkWhatsAppWebUrl({
      phoneNumber: "+2348000000000",
      sessionCode: "TLSA1B2C3"
    });

Use this for browser flows and QR codes.

## Build A Native WhatsApp Link

    const url = buildTrustLinkWhatsAppNativeUrl({
      phoneNumber: "+2348000000000",
      sessionCode: "TLSA1B2C3"
    });

Use this when the user is on a phone that can open WhatsApp directly.

## Render The WhatsApp Modal

    <WhatsAppModal
      isOpen={true}
      phoneNumber="+2348000000000"
      sessionCode="TLSA1B2C3"
      onClose={() => {}}
      onStatusChange={(status) => {
        console.log(status);
      }}
    />

The modal helps the user continue into WhatsApp.

The backend still completes the session through webhook processing.

## Device Detection

    const device = detectWhatsAppDevice();

    if (device.canOpenNativeApp) {
      // Show native WhatsApp open button.
    } else {
      // Show QR-code or WhatsApp Web flow.
    }

## Frontend Rule

Frontend code may import:

    trustlink-whatsapp-sdk
    trustlink-whatsapp-sdk/auth
    trustlink-whatsapp-sdk/ui
    trustlink-whatsapp-sdk/utils/device-detection

Frontend code must not import:

    trustlink-whatsapp-sdk/backend
