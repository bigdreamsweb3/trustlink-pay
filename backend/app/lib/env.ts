import { z } from "zod";
import { normalizePhoneNumber } from "@/app/utils/phone";

const booleanFromEnv = z.preprocess((value) => {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true") {
      return true;
    }

    if (normalized === "false") {
      return false;
    }
  }

  return value;
}, z.boolean());

const envSchema = z
  .object({
    DATABASE_URL: z.string().startsWith("postgresql://").optional(),
    SOLANA_RPC_URL: z.string().url().optional(),
    SOLANA_PROGRAM_ID: z.string().min(1).optional(),
    SOLANA_CLAIM_VERIFIER_SECRET_KEY: z.string().min(1).optional(),
    SOLANA_ESCROW_AUTHORITY_SECRET_KEY: z.string().min(1).optional(),
    SOLANA_ALLOWED_SPL_TOKENS: z.string().optional(),
    TRUSTLINK_TREASURY_OWNER: z.string().min(1).optional(),
    TRUSTLINK_CLAIM_FEE_BPS: z.coerce.number().int().min(0).max(10000).default(0),
    TRUSTLINK_CLAIM_FEE_MAX_UI_AMOUNT: z.coerce.number().min(0).default(0),
    WHATSAPP_API_KEY: z.string().min(1).optional(),
    WHATSAPP_PHONE_ID: z.string().min(1).optional(),
    WHATSAPP_API_VERSION: z.string().default("v20.0"),
    WHATSAPP_BASE_URL: z.string().url().default("https://graph.facebook.com"),
    TRUSTLINK_CLAIM_BASE_URL: z
      .string()
      .url()
      .default("https://trustlink-pay.vercel.app/claim"),
    TEST_RECIPIENT_PHONE_NUMBER: z
      .string()
      .regex(/^\+[1-9]\d{7,14}$/)
      .optional(),
    WHATSAPP_WEBHOOK_VERIFY_TOKEN: z.string().min(1).optional(),
    WHATSAPP_APP_SECRET: z.string().optional(),
    WHATSAPP_USE_TEMPLATES: booleanFromEnv.default(false),
    WHATSAPP_TEMPLATE_LANGUAGE_CODE: z.string().default("en_US"),
    WHATSAPP_PAYMENT_TEMPLATE_NAME: z.string().optional(),
    WHATSAPP_OTP_TEMPLATE_NAME: z.string().optional(),
    TRUSTLINK_BUSINESS_NUMBER: z.string().optional(),
    OTP_MAX_ATTEMPTS: z.coerce.number().int().positive().default(5),
    OTP_TTL_MINUTES: z.coerce.number().int().positive().default(5),
    OTP_RATE_LIMIT_WINDOW_MINUTES: z.coerce
      .number()
      .int()
      .positive()
      .default(15),
    OTP_RATE_LIMIT_MAX_REQUESTS: z.coerce.number().int().positive().default(3),
    OTP_RATE_LIMIT_MAX_REQUESTS_PER_IP: z.coerce
      .number()
      .int()
      .positive()
      .default(5),
    SOLANA_MOCK_MODE: booleanFromEnv.default(true),
    WHATSAPP_MOCK_MODE: booleanFromEnv.default(true),
    APP_BASE_URL: z.string().url().default("http://localhost:3000"),
    SESSION_SECRET: z.string().min(1).optional(),
    ACCESS_TOKEN_TTL_MINUTES: z.coerce.number().int().positive().default(10080),
  })
  .superRefine((value, context) => {
    if (!value.WHATSAPP_MOCK_MODE && !value.WHATSAPP_PHONE_ID) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["WHATSAPP_PHONE_ID"],
        message:
          "WHATSAPP_PHONE_ID is required when WHATSAPP_MOCK_MODE is false",
      });
    }
  });

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing required environment variable: ${name}. Please set it in your .env.local file or Vercel environment variables.`,
    );
  }
  return value;
}

function readRawEnv() {
  return {
    DATABASE_URL: process.env.DATABASE_URL,
    SOLANA_RPC_URL: process.env.SOLANA_RPC_URL,
    SOLANA_PROGRAM_ID: process.env.SOLANA_PROGRAM_ID,
    SOLANA_CLAIM_VERIFIER_SECRET_KEY:
      process.env.SOLANA_CLAIM_VERIFIER_SECRET_KEY ??
      process.env.SOLANA_ESCROW_AUTHORITY_SECRET_KEY,
    SOLANA_ESCROW_AUTHORITY_SECRET_KEY:
      process.env.SOLANA_ESCROW_AUTHORITY_SECRET_KEY ??
      process.env.SOLANA_CLAIM_VERIFIER_SECRET_KEY,
    SOLANA_ALLOWED_SPL_TOKENS: process.env.SOLANA_ALLOWED_SPL_TOKENS,
    TRUSTLINK_TREASURY_OWNER: process.env.TRUSTLINK_TREASURY_OWNER,
    TRUSTLINK_CLAIM_FEE_BPS: process.env.TRUSTLINK_CLAIM_FEE_BPS,
    TRUSTLINK_CLAIM_FEE_MAX_UI_AMOUNT: process.env.TRUSTLINK_CLAIM_FEE_MAX_UI_AMOUNT,
    WHATSAPP_API_KEY: process.env.WHATSAPP_API_KEY,
    WHATSAPP_PHONE_ID:
      process.env.WHATSAPP_PHONE_ID ??
      process.env.WHATSAPP_PHONE_NUMBER_ID ??
      process.env.PHONE_NUMBER_ID ??
      process.env.WHATSAPP_BUSINESS_PHONE_ID ??
      process.env.META_WHATSAPP_PHONE_ID,
    WHATSAPP_API_VERSION: process.env.WHATSAPP_API_VERSION,
    WHATSAPP_BASE_URL: process.env.WHATSAPP_BASE_URL,
    TRUSTLINK_CLAIM_BASE_URL: process.env.TRUSTLINK_CLAIM_BASE_URL,
    TEST_RECIPIENT_PHONE_NUMBER: process.env.TEST_RECIPIENT_PHONE_NUMBER,
    WHATSAPP_WEBHOOK_VERIFY_TOKEN: process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN,
    WHATSAPP_APP_SECRET: process.env.WHATSAPP_APP_SECRET,
    WHATSAPP_USE_TEMPLATES: process.env.WHATSAPP_USE_TEMPLATES,
    WHATSAPP_TEMPLATE_LANGUAGE_CODE:
      process.env.WHATSAPP_TEMPLATE_LANGUAGE_CODE,
    WHATSAPP_PAYMENT_TEMPLATE_NAME: process.env.WHATSAPP_PAYMENT_TEMPLATE_NAME,
    WHATSAPP_OTP_TEMPLATE_NAME: process.env.WHATSAPP_OTP_TEMPLATE_NAME,
    TRUSTLINK_BUSINESS_NUMBER: process.env.TRUSTLINK_BUSINESS_NUMBER,
    OTP_MAX_ATTEMPTS: process.env.OTP_MAX_ATTEMPTS,
    OTP_TTL_MINUTES: process.env.OTP_TTL_MINUTES,
    OTP_RATE_LIMIT_WINDOW_MINUTES: process.env.OTP_RATE_LIMIT_WINDOW_MINUTES,
    OTP_RATE_LIMIT_MAX_REQUESTS: process.env.OTP_RATE_LIMIT_MAX_REQUESTS,
    OTP_RATE_LIMIT_MAX_REQUESTS_PER_IP:
      process.env.OTP_RATE_LIMIT_MAX_REQUESTS_PER_IP,
    SOLANA_MOCK_MODE: process.env.SOLANA_MOCK_MODE,
    WHATSAPP_MOCK_MODE: process.env.WHATSAPP_MOCK_MODE,
    APP_BASE_URL: process.env.APP_BASE_URL,
    SESSION_SECRET: process.env.SESSION_SECRET,
    ACCESS_TOKEN_TTL_MINUTES: process.env.ACCESS_TOKEN_TTL_MINUTES,
  };
}

export type Env = z.infer<typeof envSchema>;

let cachedEnv: Env | null = null;

export function getEnv(): Env {
  if (cachedEnv) {
    return cachedEnv;
  }

  cachedEnv = envSchema.parse(readRawEnv());
  if (cachedEnv.TRUSTLINK_BUSINESS_NUMBER) {
    cachedEnv.TRUSTLINK_BUSINESS_NUMBER = normalizePhoneNumber(
      cachedEnv.TRUSTLINK_BUSINESS_NUMBER,
    ).replace(/^\+/, "");
  }
  return cachedEnv;
}

export function resetEnvCache() {
  cachedEnv = null;
}

export const env = new Proxy({} as Env, {
  get(_target, property) {
    const value = getEnv()[property as keyof Env];

    // Throw readable error at runtime if critical vars are missing
    if (value === undefined) {
      const criticalVars = [
        "DATABASE_URL",
        "SOLANA_RPC_URL",
        "SOLANA_PROGRAM_ID",
        "SOLANA_CLAIM_VERIFIER_SECRET_KEY",
        "SOLANA_ESCROW_AUTHORITY_SECRET_KEY",
        "WHATSAPP_API_KEY",
        "WHATSAPP_WEBHOOK_VERIFY_TOKEN",
        "SESSION_SECRET",
      ];

      if (criticalVars.includes(property as string)) {
        throw new Error(
          `Missing required environment variable: ${property as string}. Please set it in your .env.local file or Vercel environment variables.`,
        );
      }
    }

    return value;
  },
});
