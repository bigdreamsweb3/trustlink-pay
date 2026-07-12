export type WhatsAppSdkConfig = {
  AUTH_SESSION_CODE_TTL_MINUTES: number;
  WHATSAPP_MOCK_MODE: boolean;
  WHATSAPP_BASE_URL: string;
  WHATSAPP_API_VERSION: string;
  WHATSAPP_PHONE_ID: string;
  WHATSAPP_API_KEY: string;
  WHATSAPP_APP_SECRET?: string;
  TRUSTLINK_BUSINESS_NUMBER?: string;
  TRUSTLINK_CLAIM_BASE_URL: string;
  WHATSAPP_USE_TEMPLATES: boolean;
  WHATSAPP_TEMPLATE_LANGUAGE_CODE: string;
  WHATSAPP_PAYMENT_TEMPLATE_NAME?: string;
  WHATSAPP_OTP_TEMPLATE_NAME?: string;
  WHATSAPP_SESSION_REVIEW_TEMPLATE_NAME?: string;
};

let configuredConfig: WhatsAppSdkConfig | null = null;

export function configureWhatsAppSdkConfig(config: WhatsAppSdkConfig) {
  configuredConfig = config;
}

export function getWhatsAppSdkConfig(): WhatsAppSdkConfig {
  if (!configuredConfig) {
    throw new Error("WhatsApp SDK config is not configured.");
  }

  return configuredConfig;
}
