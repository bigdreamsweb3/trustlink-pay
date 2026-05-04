import { z } from "zod";
import { normalizePhoneNumber } from "@/app/utils/phone";

const phoneNumberSchema = z
  .string()
  .trim()
  .transform((value, context) => {
    try {
      return normalizePhoneNumber(value);
    } catch (error) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: error instanceof Error ? error.message : "phoneNumber must be E.164 format"
      });
      return z.NEVER;
    }
  });

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
  paymentId: z.string().uuid().optional(),
  phoneNumber: phoneNumberSchema,
  senderPhoneNumber: phoneNumberSchema,
  amount: z.number().positive(),
  tokenMintAddress: walletAddressSchema,
  senderWallet: walletAddressSchema,
  escrowVaultAddress: walletAddressSchema.optional(),
  depositSignature: z.string().trim().min(32).max(128).optional(),
  preparedPhoneIdentityPublicKey: walletAddressSchema.optional(),
  preparedPaymentReceiverPublicKey: walletAddressSchema.optional(),
  preparedEphemeralPublicKey: walletAddressSchema.optional().nullable(),
  skipWhatsAppCheck: z.boolean().optional(),
});

export const estimatePaymentSchema = z.object({
  phoneNumber: phoneNumberSchema,
  senderPhoneNumber: phoneNumberSchema,
  amount: z.number().positive(),
  tokenMintAddress: walletAddressSchema,
  senderWallet: walletAddressSchema,
});

export const acceptPaymentSchema = z
  .object({
    paymentId: z.string().uuid(),
    pin: pinSchema,
    walletAddress: walletAddressSchema.optional(),
    receiverWalletId: z.string().uuid().optional(),
    derivedPaymentReceiverPublicKey: walletAddressSchema.optional(),
    privacySpendSignature: z.string().trim().min(64).optional(),
    blockchainSignature: z.string().trim().min(32).max(128).optional(),
  });

export const otpPurposeSchema = z.enum(["generic", "register", "login", "claim", "auth", "pin_change", "wallet_add"]);

export const sendOtpSchema = z.object({
  phoneNumber: phoneNumberSchema,
  purpose: otpPurposeSchema.default("generic"),
});

export const verifyOtpSchema = z.object({
  phoneNumber: phoneNumberSchema,
  otp: z.string().regex(/^\d{6}$/),
  purpose: otpPurposeSchema.default("generic"),
});

export const registerSchema = z.object({
  phoneNumber: phoneNumberSchema,
  otp: z.string().regex(/^\d{6}$/),
  displayName: displayNameSchema,
  handle: handleSchema,
  walletAddress: walletAddressSchema.optional(),
});

export const identityKeyRegistrationSchema = z.object({
  phoneIdentityPublicKey: walletAddressSchema,
  privacyViewPublicKey: z.string().trim().length(64),
  privacySpendPublicKey: walletAddressSchema,
  settlementWalletPublicKey: walletAddressSchema,
  recoveryWalletPublicKey: walletAddressSchema.optional().nullable(),
  bindingSignature: z.string().trim().min(64).optional().nullable(),
  blockchainSignature: z.string().trim().min(32).max(128).optional().nullable(),
});

export const loginSchema = z.object({
  phoneNumber: phoneNumberSchema,
  otp: z.string().regex(/^\d{6}$/),
});

export const startClaimSchema = z.object({
  paymentId: z.string().uuid(),
});

export const estimateClaimFeeSchema = z
  .object({
    paymentId: z.string().uuid(),
    walletAddress: walletAddressSchema.optional(),
    receiverWalletId: z.string().uuid().optional(),
  });

export const pinSetupSchema = z.object({
  challengeToken: challengeTokenSchema,
  pin: pinSchema,
});

export const pinVerifySchema = z.object({
  challengeToken: challengeTokenSchema,
  pin: pinSchema,
});

export const pinChallengeSchema = z.object({});

export const startAuthOtpSchema = z.object({
  phoneNumber: phoneNumberSchema,
  skipWhatsAppCheck: z.boolean().optional(),
});

export const authPhoneStatusSchema = z.object({
  phoneNumber: phoneNumberSchema,
});

export const authPhoneVerifySchema = z.object({
  phoneNumber: phoneNumberSchema,
  otp: z.string().regex(/^\d{6}$/),
  displayName: z.string().trim().min(2).max(80).optional().or(z.literal("")),
});

export const pinChangeStartSchema = z.object({});

export const pinChangeVerifySchema = z.object({
  otp: z.string().regex(/^\d{6}$/),
  newPin: pinSchema,
});

export const addReceiverWalletSchema = z.object({
  walletName: z.string().trim().min(2).max(64),
  walletAddress: walletAddressSchema,
  otp: z.string().regex(/^\d{6}$/),
});

export const startReceiverWalletVerificationSchema = z.object({});

export const updateProfileSchema = z.object({
  displayName: displayNameSchema,
  handle: handleSchema,
});

export const recipientLookupSchema = z.object({
  phoneNumber: phoneNumberSchema,
  skipWhatsAppCheck: z.boolean().optional(),
});

export const verifyWhatsAppNumberSchema = z.object({
  phoneNumber: phoneNumberSchema,
});

export const walletTokenLookupSchema = z.object({
  walletAddress: walletAddressSchema,
});

export const addRecoveryWalletSchema = z.object({
  walletAddress: walletAddressSchema,
  allowUpdate: z.boolean().optional(),
});

export const setIdentityFreezeSchema = z.object({
  authorityWallet: walletAddressSchema,
  frozen: z.boolean(),
});

export const requestRecoverySchema = z.object({
  authorityWallet: walletAddressSchema,
});

export const updateAutoclaimSettingsSchema = z.object({
  enabled: z.boolean(),
});

export const requestPaymentRefundSchema = z.object({
  paymentId: z.string().uuid(),
  pin: pinSchema,
  blockchainSignature: z.string().trim().min(32).max(128).optional(),
});

export const claimPaymentRefundSchema = z.object({
  paymentId: z.string().uuid(),
  pin: pinSchema,
  walletAddress: walletAddressSchema.optional(),
  derivedPaymentReceiverPublicKey: walletAddressSchema.optional(),
  privacySpendSignature: z.string().trim().min(64).optional(),
  blockchainSignature: z.string().trim().min(32).max(128).optional(),
});
