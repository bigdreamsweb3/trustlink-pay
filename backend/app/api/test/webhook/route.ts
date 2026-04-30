import { NextRequest, NextResponse } from "next/server";
import { processWhatsAppWebhookPayload } from "@/app/services/whatsapp-webhook";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const testMessage = searchParams.get("message");
  const testPhone = searchParams.get("phone") || "+1234567890";

  if (!testMessage) {
    return NextResponse.json({
      error: "Missing 'message' parameter",
      usage: "GET /api/test/webhook?message=Verify%20TrustLink%20Pay%20Code%3ATL123456&phone=+1234567890"
    }, { status: 400 });
  }

  try {
    // Simulate a WhatsApp webhook payload
    const mockPayload = {
      object: "whatsapp_business_account",
      entry: [{
        id: "test-entry-id",
        changes: [{
          value: {
            messaging_product: "whatsapp",
            metadata: {
              display_phone_number: testPhone,
              phone_number_id: "test-phone-id"
            },
            contacts: [{
              profile: {
                name: "Test User"
              },
              wa_id: testPhone.replace(/\D/g, "")
            }],
            messages: [{
              from: testPhone.replace(/\D/g, ""),
              id: "test-message-id",
              timestamp: Math.floor(Date.now() / 1000).toString(),
              text: {
                body: testMessage
              }
            }]
          },
          field: "messages"
        }]
      }]
    };

    // Process the webhook payload
    await processWhatsAppWebhookPayload(mockPayload);

    return NextResponse.json({
      success: true,
      message: "Webhook test completed successfully",
      payload: mockPayload,
      processed: true
    });

  } catch (error) {
    console.error("[Test] Webhook test failed:", error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
      message: "Webhook test failed"
    }, { status: 500 });
  }
}
