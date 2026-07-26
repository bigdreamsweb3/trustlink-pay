import { sha256 } from "@noble/hashes/sha2";
import { utf8ToBytes, bytesToHex } from "@noble/hashes/utils";
import { RecurringFeatureFlags, assertRecurringMandatesEnabled, assertVerifiedProviderExecutionEnabled } from "./feature-flags.js";
import { RecurringProvider, assertVerifiedRecurringProvider, providerSupportsTokenMint } from "./provider.js";

export type RecurringMandateStatus = "PENDING" | "ACTIVE" | "SUSPENDED" | "REVOKED" | "EXPIRED";

export interface RecurringMandate {
  mandateId: string;
  providerId: string;
  subscriberCommitment: string;
  sourceCommitment: string;
  assetCommitment: string;
  policyCommitment?: string | null;
  tokenMintAddress: string;
  maxChargeAmountBaseUnits: bigint;
  minIntervalSeconds: number;
  maxExecutions?: number | null;
  maxCumulativeAmountBaseUnits?: bigint | null;
  startTime: string;
  expiryTime: string;
  status: RecurringMandateStatus;
  executionNonce: string;
  createdAt: string;
  updatedAt: string;
}

const ALLOWED_MANDATE_STATUSES: RecurringMandateStatus[] = [
  "PENDING",
  "ACTIVE",
  "SUSPENDED",
  "REVOKED",
  "EXPIRED",
];

export class RecurringMandateValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RecurringMandateValidationError";
  }
}

function assertIsoTimestamp(value: unknown, fieldName: string): void {
  if (typeof value !== "string") {
    throw new RecurringMandateValidationError(`${fieldName} must be an ISO timestamp string.`);
  }
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) {
    throw new RecurringMandateValidationError(`${fieldName} must be a valid ISO timestamp string.`);
  }
}

export function validateRecurringMandate(
  mandate: RecurringMandate,
  provider: RecurringProvider,
  flags: RecurringFeatureFlags = {
    recurringMandatesEnabled: false,
    verifiedProviderExecutionEnabled: false,
  },
): void {
  assertRecurringMandatesEnabled(flags);
  assertVerifiedProviderExecutionEnabled(flags);
  assertVerifiedRecurringProvider(provider);

  if (!mandate || typeof mandate !== "object") {
    throw new RecurringMandateValidationError("Mandate record must be a valid object.");
  }

  if (!mandate.mandateId || typeof mandate.mandateId !== "string") {
    throw new RecurringMandateValidationError("mandateId is required and must be a string.");
  }

  if (mandate.providerId !== provider.providerId) {
    throw new RecurringMandateValidationError("mandate providerId must match the verified provider.");
  }

  if (!mandate.subscriberCommitment || typeof mandate.subscriberCommitment !== "string") {
    throw new RecurringMandateValidationError("subscriberCommitment is required and must be a string.");
  }

  if (!mandate.sourceCommitment || typeof mandate.sourceCommitment !== "string") {
    throw new RecurringMandateValidationError("sourceCommitment is required and must be a string.");
  }

  if (!mandate.assetCommitment || typeof mandate.assetCommitment !== "string") {
    throw new RecurringMandateValidationError("assetCommitment is required and must be a string.");
  }

  if (mandate.policyCommitment != null && typeof mandate.policyCommitment !== "string") {
    throw new RecurringMandateValidationError("policyCommitment must be a string when provided.");
  }

  if (!mandate.tokenMintAddress || typeof mandate.tokenMintAddress !== "string") {
    throw new RecurringMandateValidationError("tokenMintAddress is required and must be a string.");
  }

  if (!providerSupportsTokenMint(provider, mandate.tokenMintAddress)) {
    throw new RecurringMandateValidationError("Provider does not support the requested token mint.");
  }

  if (typeof mandate.maxChargeAmountBaseUnits !== "bigint" || mandate.maxChargeAmountBaseUnits <= 0n) {
    throw new RecurringMandateValidationError("maxChargeAmountBaseUnits is required and must be a positive bigint.");
  }

  if (!Number.isInteger(mandate.minIntervalSeconds) || mandate.minIntervalSeconds <= 0) {
    throw new RecurringMandateValidationError("minIntervalSeconds is required and must be a positive integer.");
  }

  if (mandate.maxExecutions != null && (!Number.isInteger(mandate.maxExecutions) || mandate.maxExecutions <= 0)) {
    throw new RecurringMandateValidationError("maxExecutions must be a positive integer when provided.");
  }

  if (
    mandate.maxCumulativeAmountBaseUnits != null &&
    (typeof mandate.maxCumulativeAmountBaseUnits !== "bigint" || mandate.maxCumulativeAmountBaseUnits <= 0n)
  ) {
    throw new RecurringMandateValidationError("maxCumulativeAmountBaseUnits must be a positive bigint when provided.");
  }

  if (
    mandate.maxCumulativeAmountBaseUnits != null &&
    mandate.maxChargeAmountBaseUnits > mandate.maxCumulativeAmountBaseUnits
  ) {
    throw new RecurringMandateValidationError(
      "maxChargeAmountBaseUnits must not exceed maxCumulativeAmountBaseUnits.",
    );
  }

  assertIsoTimestamp(mandate.startTime, "startTime");
  assertIsoTimestamp(mandate.expiryTime, "expiryTime");

  if (Date.parse(mandate.startTime) >= Date.parse(mandate.expiryTime)) {
    throw new RecurringMandateValidationError("startTime must be before expiryTime.");
  }

  if (!ALLOWED_MANDATE_STATUSES.includes(mandate.status)) {
    throw new RecurringMandateValidationError(
      `status must be one of ${ALLOWED_MANDATE_STATUSES.join(", ")}`,
    );
  }

  if (!mandate.executionNonce || typeof mandate.executionNonce !== "string") {
    throw new RecurringMandateValidationError("executionNonce is required and must be a string.");
  }

  if (!mandate.createdAt || typeof mandate.createdAt !== "string") {
    throw new RecurringMandateValidationError("createdAt is required and must be an ISO timestamp string.");
  }

  if (!mandate.updatedAt || typeof mandate.updatedAt !== "string") {
    throw new RecurringMandateValidationError("updatedAt is required and must be an ISO timestamp string.");
  }

  assertIsoTimestamp(mandate.createdAt, "createdAt");
  assertIsoTimestamp(mandate.updatedAt, "updatedAt");
}

export function buildRecurringMandateCanonicalMessage(mandate: RecurringMandate): string {
  const fields = [
    ["domain", "tsn-recurring-mandate-v1"],
    ["mandateId", mandate.mandateId],
    ["providerId", mandate.providerId],
    ["subscriberCommitment", mandate.subscriberCommitment],
    ["sourceCommitment", mandate.sourceCommitment],
    ["assetCommitment", mandate.assetCommitment],
    ["policyCommitment", mandate.policyCommitment ?? ""],
    ["tokenMintAddress", mandate.tokenMintAddress],
    ["maxChargeAmountBaseUnits", mandate.maxChargeAmountBaseUnits.toString()],
    ["minIntervalSeconds", mandate.minIntervalSeconds.toString()],
    ["maxExecutions", mandate.maxExecutions != null ? mandate.maxExecutions.toString() : ""],
    ["maxCumulativeAmountBaseUnits", mandate.maxCumulativeAmountBaseUnits != null ? mandate.maxCumulativeAmountBaseUnits.toString() : ""],
    ["startTime", mandate.startTime],
    ["expiryTime", mandate.expiryTime],
    ["status", mandate.status],
    ["executionNonce", mandate.executionNonce],
    ["createdAt", mandate.createdAt],
    ["updatedAt", mandate.updatedAt],
  ];

  return fields.map(([key, value]) => `${key}:${value}`).join("\n");
}

export function computeRecurringMandateCommitment(mandate: RecurringMandate): string {
  const message = buildRecurringMandateCanonicalMessage(mandate);
  return bytesToHex(sha256(utf8ToBytes(message)));
}
