export type RecurringFeatureFlags = {
  recurringMandatesEnabled: boolean;
  verifiedProviderExecutionEnabled: boolean;
};

export const RECURRING_MANDATES_ENABLED_FLAG = "RECURRING_MANDATES_ENABLED";
export const VERIFIED_PROVIDER_EXECUTION_ENABLED_FLAG = "VERIFIED_PROVIDER_EXECUTION_ENABLED";

export const TSN_GLOBAL_CONFIG_RECURRING_MANDATES_FLAG = "recurring_mandates_enabled";
export const TSN_GLOBAL_CONFIG_VERIFIED_PROVIDER_EXECUTION_FLAG = "verified_provider_execution_enabled";

export function recurringFeatureFlagsFromEnv(
  env: Record<string, string | undefined>,
): RecurringFeatureFlags {
  return {
    recurringMandatesEnabled: env[RECURRING_MANDATES_ENABLED_FLAG] === "true",
    verifiedProviderExecutionEnabled: env[VERIFIED_PROVIDER_EXECUTION_ENABLED_FLAG] === "true",
  };
}

export const DEFAULT_RECURRING_FEATURE_FLAGS: RecurringFeatureFlags = {
  recurringMandatesEnabled: false,
  verifiedProviderExecutionEnabled: false,
};

export class RecurringFeatureDisabledError extends Error {
  constructor(message?: string) {
    super(message ?? "Recurring features are disabled");
    this.name = "RecurringFeatureDisabledError";
  }
}

export function assertRecurringMandatesEnabled(
  flags: RecurringFeatureFlags = DEFAULT_RECURRING_FEATURE_FLAGS,
) {
  if (!flags.recurringMandatesEnabled) {
    throw new RecurringFeatureDisabledError(
      "Recurring mandates are disabled. Set recurringMandatesEnabled to true to enable the feature.",
    );
  }
}

export function assertVerifiedProviderExecutionEnabled(
  flags: RecurringFeatureFlags = DEFAULT_RECURRING_FEATURE_FLAGS,
) {
  if (!flags.verifiedProviderExecutionEnabled) {
    throw new RecurringFeatureDisabledError(
      "Verified provider execution is disabled. Set verifiedProviderExecutionEnabled to true to enable this execution path.",
    );
  }
}
