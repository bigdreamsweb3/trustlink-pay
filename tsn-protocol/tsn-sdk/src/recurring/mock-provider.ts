import type { RecurringProvider } from "./provider.js";
import { TSN_TEST_PROVIDER_ID } from "./provider.js";

export { TSN_TEST_PROVIDER_ID };
export const TSN_TEST_PROVIDER_PDA = "TSN_TEST_PROVIDER_PDA_DEVNET_ONLY";
export const TSN_TEST_PROVIDER_ROUTE_COMMITMENT =
  "test_route_commitment_000000000000000000000000000000000000000000";

export const MOCK_DEVNET_RECURRING_PROVIDER: RecurringProvider = {
  providerId: TSN_TEST_PROVIDER_ID,
  providerPda: TSN_TEST_PROVIDER_PDA,
  displayName: "TSN Test Provider (Devnet Only)",
  status: "ACTIVE",
  recurringEnabled: true,
  supportedTokenMints: ["Es9vMFrzaCERicEuTLX1yRkgzUeQdvFhwGAcTftbN8Zy"],
  routeCommitment: TSN_TEST_PROVIDER_ROUTE_COMMITMENT,
  verifiedAt: new Date().toISOString(),
  network: "devnet",
};

export const MOCK_RECURRING_PROVIDER_FIXTURE_NOTE =
  "This provider fixture exists only for tests and Devnet. It must not be included in mainnet configuration.";
