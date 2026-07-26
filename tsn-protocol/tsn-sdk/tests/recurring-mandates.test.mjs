import assert from "node:assert";
import { describe, it } from "node:test";
import {
  RecurringFeatureDisabledError,
  DEFAULT_RECURRING_FEATURE_FLAGS,
  assertRecurringMandatesEnabled,
  assertVerifiedProviderExecutionEnabled,
} from "../dist/recurring/feature-flags.js";
import {
  MOCK_DEVNET_RECURRING_PROVIDER,
  TSN_TEST_PROVIDER_ID,
} from "../dist/recurring/mock-provider.js";
import {
  validateRecurringMandate,
  computeRecurringMandateCommitment,
  buildRecurringMandateCanonicalMessage,
} from "../dist/recurring/mandate.js";
import { validateRecurringProvider } from "../dist/recurring/provider.js";

const validMandate = {
  mandateId: "mandate-123",
  providerId: TSN_TEST_PROVIDER_ID,
  subscriberCommitment: "subscriber-commitment-abc",
  sourceCommitment: "source-commitment-abc",
  assetCommitment: "asset-commitment-abc",
  policyCommitment: "policy-commitment-abc",
  tokenMintAddress: "Es9vMFrzaCERicEuTLX1yRkgzUeQdvFhwGAcTftbN8Zy",
  maxChargeAmountBaseUnits: 1000000n,
  minIntervalSeconds: 86400,
  maxExecutions: 12,
  maxCumulativeAmountBaseUnits: 12000000n,
  startTime: new Date(Date.now() + 1000).toISOString(),
  expiryTime: new Date(Date.now() + 1000 * 60 * 60 * 24 * 365).toISOString(),
  status: "ACTIVE",
  executionNonce: "nonce-1",
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

const enabledFlags = {
  recurringMandatesEnabled: true,
  verifiedProviderExecutionEnabled: true,
};

describe("Recurring provider validation", () => {
  it("accepts a verified active recurring provider fixture", () => {
    assert.doesNotThrow(() => validateRecurringProvider(MOCK_DEVNET_RECURRING_PROVIDER));
  });

  it("validates provider records without token-specific checks", () => {
    const unsupported = { ...MOCK_DEVNET_RECURRING_PROVIDER, supportedTokenMints: ["FooTokenMint"] };

    assert.doesNotThrow(() => validateRecurringProvider(unsupported));
  });
});

describe("Recurring mandate validation", () => {
  it("rejects mandates when recurring features are disabled", () => {
    assert.throws(
      () => validateRecurringMandate(validMandate, MOCK_DEVNET_RECURRING_PROVIDER, DEFAULT_RECURRING_FEATURE_FLAGS),
      {
        name: "RecurringFeatureDisabledError",
      },
    );
  });

  it("accepts a valid mandate when recurring features are enabled", () => {
    assert.doesNotThrow(() => validateRecurringMandate(validMandate, MOCK_DEVNET_RECURRING_PROVIDER, enabledFlags));
  });

  it("rejects mandates when the provider does not support the token mint", () => {
    const unsupportedProvider = {
      ...MOCK_DEVNET_RECURRING_PROVIDER,
      supportedTokenMints: ["FooTokenMint"],
    };

    assert.throws(
      () => validateRecurringMandate(validMandate, unsupportedProvider, enabledFlags),
      {
        name: "RecurringMandateValidationError",
      },
    );
  });
});

describe("Recurring feature flags", () => {
  it("fail closed by default", () => {
    assert.throws(
      () => assertRecurringMandatesEnabled(DEFAULT_RECURRING_FEATURE_FLAGS),
      {
        name: "RecurringFeatureDisabledError",
      },
    );

    assert.throws(
      () => assertVerifiedProviderExecutionEnabled(DEFAULT_RECURRING_FEATURE_FLAGS),
      {
        name: "RecurringFeatureDisabledError",
      },
    );
  });
});

describe("Recurring provider validation", () => {
  it("rejects the TSN test provider on mainnet-beta", () => {
    const testProviderOnMainnet = {
      ...MOCK_DEVNET_RECURRING_PROVIDER,
      providerId: TSN_TEST_PROVIDER_ID,
      network: "mainnet-beta",
    };

    assert.throws(
      () => validateRecurringProvider(testProviderOnMainnet),
      {
        name: "RecurringProviderValidationError",
      },
    );
  });
});

describe("Recurring mandate canonical serialization", () => {
  it("produces a consistent commitment for a given mandate", () => {
    const commitmentA = computeRecurringMandateCommitment(validMandate);
    const commitmentB = computeRecurringMandateCommitment(validMandate);

    assert.strictEqual(commitmentA, commitmentB);
    assert.match(commitmentA, /^[0-9a-f]{64}$/);
  });

  it("includes a versioned domain separator in the serialized message", () => {
    const canonicalMessage = buildRecurringMandateCanonicalMessage(validMandate);
    assert.ok(canonicalMessage.includes("domain:tsn-recurring-mandate-v1"));
  });
});
