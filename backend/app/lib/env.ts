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

const emptyStringToUndefined = z.preprocess((value) => {
  if (typeof value === "string" && value.trim() === "") {
    return undefined;
  }
  return value;
}, z.any());

const envSchema = z
  .object({
    DATABASE_URL: z.string().startsWith("postgresql://").optional(),
    SOLANA_CLAIM_VERIFIER_SECRET_KEY: z.string().min(1).optional(),
    SOLANA_ESCROW_AUTHORITY_SECRET_KEY: z.string().min(1).optional(),
    SOLANA_ALLOWED_SPL_TOKENS: z.string().optional(),
    TRUSTLINK_TREASURY_OWNER: z.string().min(1).optional(),
    TRUSTLINK_SEND_FEE_BPS: z.coerce
      .number()
      .int()
      .min(0)
      .max(10000)
      .default(0),
    TRUSTLINK_SEND_FEE_MAX_UI_AMOUNT: z.coerce.number().min(0).default(0),
    TRUSTLINK_SEND_FEE_MAX_USD: emptyStringToUndefined
      .pipe(z.coerce.number().min(0))
      .optional(),
    TRUSTLINK_FEE_COVERAGE_TX_COUNT: z.coerce
      .number()
      .int()
      .positive()
      .default(4),
    TRUSTLINK_CLAIM_FEE_BPS: z.coerce
      .number()
      .int()
      .min(0)
      .max(10000)
      .default(0),
    TRUSTLINK_CLAIM_FEE_MAX_UI_AMOUNT: z.coerce.number().min(0).default(0),
    TRUSTLINK_CLAIM_FEE_MAX_USD: emptyStringToUndefined
      .pipe(z.coerce.number().min(0))
      .optional(),
    TRUSTLINK_DEFAULT_EXPIRY_SECONDS: z.coerce
      .number()
      .int()
      .positive()
      .default(604800),
    TRUSTLINK_INVITE_PAYMENT_MAX_USD: z.coerce.number().positive().default(10),
    TRUSTLINK_AUTOCLAIM_MAX_USD: z.coerce.number().positive().default(100),
    TRUSTLINK_INVITE_EXPIRY_BUSINESS_DAYS: z.coerce
      .number()
      .int()
      .positive()
      .default(7),
    TRUSTLINK_REFUND_WAIT_HOURS: z.coerce.number().int().positive().default(48),
    TRUSTLINK_REFUND_ENGAGEMENT_EXTENSION_HOURS: z.coerce
      .number()
      .int()
      .positive()
      .default(48),
    TRUSTLINK_RECOVERY_WALLETS: z.string().optional(),
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
    WHATSAPP_SESSION_REVIEW_TEMPLATE_NAME: z.string().optional(),
    TRUSTLINK_BUSINESS_NUMBER: z.string().optional(),
    AUTH_SESSION_CODE_TTL_MINUTES: z.coerce
      .number()
      .int()
      .positive()
      .default(15),
    AUTH_CHALLENGE_TTL_MINUTES: z.coerce.number().int().positive().default(30),
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
    APP_BASE_URL: z.string().url().default("https://trustlink-pay-backend.vercel.app"),
    SESSION_SECRET: z.string().min(1).optional(),
    ACCESS_TOKEN_TTL_MINUTES: z.coerce.number().int().positive().default(10080),
    TSN_ENABLED: booleanFromEnv.default(false),
    TSN_MEMPOOL_URL: z.string().url().default("http://0.0.0.0:8000"),
    TSN_MEMPOOL_API_KEY: z.string().optional(),
    TSN_CREATE_INTENTS_ONCHAIN: booleanFromEnv.default(false),
    TSN_SYNC_ONCHAIN: booleanFromEnv.default(true),
    TSN_STATUS_SYNC_INTERVAL_MS: z.coerce.number().int().min(2_000).default(5_000),
    TSN_MEMPOOL_TIMEOUT_MS: z.coerce.number().int().min(1_000).default(4_000),
    CRON_SECRET: z.preprocess(
      (value) =>
        typeof value === "string" && value.trim() === ""
          ? undefined
          : value,
      z.string().min(16).optional(),
    ),
    TINS_PROGRAM_ID: z.string().default("TinseNnU588NkmRZBe4ADJbxqrqQma92678UFP6VuwT"),
    LOG_SUCCESS_REQUESTS: booleanFromEnv.default(true),
    LOG_SESSION_CODES: booleanFromEnv.default(false),
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
    SOLANA_CLAIM_VERIFIER_SECRET_KEY:
      process.env.SOLANA_CLAIM_VERIFIER_SECRET_KEY ??
      process.env.SOLANA_ESCROW_AUTHORITY_SECRET_KEY,
    SOLANA_ESCROW_AUTHORITY_SECRET_KEY:
      process.env.SOLANA_ESCROW_AUTHORITY_SECRET_KEY ??
      process.env.SOLANA_CLAIM_VERIFIER_SECRET_KEY,
    SOLANA_ALLOWED_SPL_TOKENS: process.env.SOLANA_ALLOWED_SPL_TOKENS,
    TRUSTLINK_TREASURY_OWNER: process.env.TRUSTLINK_TREASURY_OWNER,
    TRUSTLINK_SEND_FEE_BPS: process.env.TRUSTLINK_SEND_FEE_BPS,
    TRUSTLINK_SEND_FEE_MAX_UI_AMOUNT:
      process.env.TRUSTLINK_SEND_FEE_MAX_UI_AMOUNT,
    TRUSTLINK_SEND_FEE_MAX_USD: process.env.TRUSTLINK_SEND_FEE_MAX_USD,
    TRUSTLINK_FEE_COVERAGE_TX_COUNT:
      process.env.TRUSTLINK_FEE_COVERAGE_TX_COUNT,
    TRUSTLINK_CLAIM_FEE_BPS: process.env.TRUSTLINK_CLAIM_FEE_BPS,
    TRUSTLINK_CLAIM_FEE_MAX_UI_AMOUNT:
      process.env.TRUSTLINK_CLAIM_FEE_MAX_UI_AMOUNT,
    TRUSTLINK_CLAIM_FEE_MAX_USD: process.env.TRUSTLINK_CLAIM_FEE_MAX_USD,
    TRUSTLINK_DEFAULT_EXPIRY_SECONDS:
      process.env.TRUSTLINK_DEFAULT_EXPIRY_SECONDS,
    TRUSTLINK_INVITE_PAYMENT_MAX_USD:
      process.env.TRUSTLINK_INVITE_PAYMENT_MAX_USD,
    TRUSTLINK_AUTOCLAIM_MAX_USD: process.env.TRUSTLINK_AUTOCLAIM_MAX_USD,
    TRUSTLINK_INVITE_EXPIRY_BUSINESS_DAYS:
      process.env.TRUSTLINK_INVITE_EXPIRY_BUSINESS_DAYS,
    TRUSTLINK_REFUND_WAIT_HOURS: process.env.TRUSTLINK_REFUND_WAIT_HOURS,
    TRUSTLINK_REFUND_ENGAGEMENT_EXTENSION_HOURS:
      process.env.TRUSTLINK_REFUND_ENGAGEMENT_EXTENSION_HOURS,
    TRUSTLINK_RECOVERY_WALLETS: process.env.TRUSTLINK_RECOVERY_WALLETS,
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
    WHATSAPP_SESSION_REVIEW_TEMPLATE_NAME:
      process.env.WHATSAPP_SESSION_REVIEW_TEMPLATE_NAME,
    TRUSTLINK_BUSINESS_NUMBER: process.env.TRUSTLINK_BUSINESS_NUMBER,
    AUTH_SESSION_CODE_TTL_MINUTES: process.env.AUTH_SESSION_CODE_TTL_MINUTES,
    AUTH_CHALLENGE_TTL_MINUTES: process.env.AUTH_CHALLENGE_TTL_MINUTES,
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
    TSN_ENABLED: process.env.TSN_ENABLED,
    TSN_MEMPOOL_URL: process.env.TSN_MEMPOOL_URL,
    TSN_MEMPOOL_API_KEY: process.env.TSN_MEMPOOL_API_KEY,
    TSN_CREATE_INTENTS_ONCHAIN: process.env.TSN_CREATE_INTENTS_ONCHAIN,
    TSN_SYNC_ONCHAIN: process.env.TSN_SYNC_ONCHAIN,
    TSN_STATUS_SYNC_INTERVAL_MS: process.env.TSN_STATUS_SYNC_INTERVAL_MS,
    TSN_MEMPOOL_TIMEOUT_MS: process.env.TSN_MEMPOOL_TIMEOUT_MS,
    CRON_SECRET: process.env.CRON_SECRET,
    TINS_PROGRAM_ID: process.env.TINS_PROGRAM_ID,
    LOG_SUCCESS_REQUESTS: process.env.LOG_SUCCESS_REQUESTS,
    LOG_SESSION_CODES: process.env.LOG_SESSION_CODES,
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
