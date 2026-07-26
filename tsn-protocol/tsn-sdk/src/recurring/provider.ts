export const TSN_TEST_PROVIDER_ID = "TSN_TEST_PROVIDER";

export type RecurringProviderStatus = "PENDING" | "ACTIVE" | "SUSPENDED" | "REVOKED";

export interface RecurringProvider {
  providerId: string;
  providerPda: string;
  displayName: string;
  status: RecurringProviderStatus;
  recurringEnabled: boolean;
  supportedTokenMints: string[];
  routeCommitment: string;
  verifiedAt: string;
  network: string;
}

const ALLOWED_PROVIDER_STATUSES: RecurringProviderStatus[] = [
  "PENDING",
  "ACTIVE",
  "SUSPENDED",
  "REVOKED",
];

export class RecurringProviderValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RecurringProviderValidationError";
  }
}

export function validateRecurringProvider(provider: RecurringProvider): void {
  if (!provider || typeof provider !== "object") {
    throw new RecurringProviderValidationError("Provider record must be a valid object.");
  }

  if (!provider.providerId || typeof provider.providerId !== "string") {
    throw new RecurringProviderValidationError("providerId is required and must be a string.");
  }

  if (!provider.providerPda || typeof provider.providerPda !== "string") {
    throw new RecurringProviderValidationError("providerPda is required and must be a string.");
  }

  if (!provider.displayName || typeof provider.displayName !== "string") {
    throw new RecurringProviderValidationError("displayName is required and must be a string.");
  }

  if (!ALLOWED_PROVIDER_STATUSES.includes(provider.status)) {
    throw new RecurringProviderValidationError(
      `status must be one of ${ALLOWED_PROVIDER_STATUSES.join(", ")}`,
    );
  }

  if (typeof provider.recurringEnabled !== "boolean") {
    throw new RecurringProviderValidationError("recurringEnabled is required and must be a boolean.");
  }

  if (!Array.isArray(provider.supportedTokenMints) || provider.supportedTokenMints.some((mint) => typeof mint !== "string")) {
    throw new RecurringProviderValidationError("supportedTokenMints must be an array of token mint addresses.");
  }

  if (!provider.routeCommitment || typeof provider.routeCommitment !== "string") {
    throw new RecurringProviderValidationError("routeCommitment is required and must be a string.");
  }

  if (!provider.verifiedAt || typeof provider.verifiedAt !== "string") {
    throw new RecurringProviderValidationError("verifiedAt is required and must be an ISO timestamp string.");
  }

  if (!provider.network || typeof provider.network !== "string") {
    throw new RecurringProviderValidationError("network is required and must be a string.");
  }

  if (provider.providerId === TSN_TEST_PROVIDER_ID && provider.network === "mainnet-beta") {
    throw new RecurringProviderValidationError(
      "TSN_TEST_PROVIDER is only allowed on Devnet and must not be used on mainnet-beta.",
    );
  }
}

export function assertVerifiedRecurringProvider(provider: RecurringProvider): void {
  validateRecurringProvider(provider);

  if (provider.status !== "ACTIVE") {
    throw new RecurringProviderValidationError("Provider must be ACTIVE to support recurring mandates.");
  }

  if (!provider.recurringEnabled) {
    throw new RecurringProviderValidationError("Provider must have recurring permission enabled.");
  }
}

export function providerSupportsTokenMint(provider: RecurringProvider, tokenMint: string): boolean {
  return provider.supportedTokenMints.includes(tokenMint);
}
