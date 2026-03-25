import { z } from "zod";

const phoneNumberSchema = z
  .string()
  .trim()
  .regex(/^\+[1-9]\d{7,14}$/, "phoneNumber must be E.164 format");

const walletAddressSchema = z.string().trim().min(32).max(64);
const displayNameSchema = z.string().trim().min(2).max(80);
const handleSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(
    /^[a-z0-9_]{3,32}$/,
    "handle must be 3-32 chars using lowercase letters, numbers, or underscores",
  );
const pinSchema = z.string().trim().regex(/^\d{6}$/, "pin must be exactly 6 digits");
const challengeTokenSchema = z.string().trim().min(20);

export const createPaymentSchema = z.object({
  phoneNumber: phoneNumberSchema,
  senderPhoneNumber: phoneNumberSchema,
  amount: z.number().positive(),
  token: z.string().trim().min(2).max(10).toUpperCase(),
  senderWallet: walletAddressSchema,
  depositSignature: z.string().trim().min(32).max(128).optional(),
});

export const acceptPaymentSchema = z
  .object({
    paymentId: z.string().uuid(),
    otp: z.string().regex(/^\d{6}$/),
    walletAddress: walletAddressSchema.optional(),
    receiverWalletId: z.string().uuid().optional(),
  })
  .refine((value) => Boolean(value.walletAddress || value.receiverWalletId), {
    message: "walletAddress or receiverWalletId is required",
  });

export const sendOtpSchema = z.object({
  phoneNumber: phoneNumberSchema,
  purpose: z.enum(["generic", "register", "login", "claim"]).default("generic"),
});

export const verifyOtpSchema = z.object({
  phoneNumber: phoneNumberSchema,
  otp: z.string().regex(/^\d{6}$/),
  purpose: z.enum(["generic", "register", "login", "claim"]).default("generic"),
});

export const registerSchema = z.object({
  phoneNumber: phoneNumberSchema,
  otp: z.string().regex(/^\d{6}$/),
  displayName: displayNameSchema,
  handle: handleSchema,
  walletAddress: walletAddressSchema.optional(),
});

export const loginSchema = z.object({
  phoneNumber: phoneNumberSchema,
  otp: z.string().regex(/^\d{6}$/),
});

export const startClaimSchema = z.object({
  paymentId: z.string().uuid(),
});

export const pinSetupSchema = z.object({
  challengeToken: challengeTokenSchema,
  pin: pinSchema,
});

export const pinVerifySchema = z.object({
  challengeToken: challengeTokenSchema,
  pin: pinSchema,
});

export const startAuthOtpSchema = z.object({
  phoneNumber: phoneNumberSchema,
});

export const addReceiverWalletSchema = z.object({
  walletName: z.string().trim().min(2).max(64),
  walletAddress: walletAddressSchema,
});

export const updateProfileSchema = z.object({
  displayName: displayNameSchema,
  handle: handleSchema,
});

export const recipientLookupSchema = z.object({
  phoneNumber: phoneNumberSchema,
});

export const walletTokenLookupSchema = z.object({
  walletAddress: walletAddressSchema,
});
