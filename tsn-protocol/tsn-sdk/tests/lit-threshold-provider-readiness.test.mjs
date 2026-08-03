import assert from "node:assert/strict";
import test from "node:test";

import {
  LIT_SOLANA_TIN_ACCESS_READINESS,
} from "../dist/lit-threshold-provider.js";

test("Lit Solana master-seed access fails closed until device binding is network-enforced", () => {
  assert.equal(
    LIT_SOLANA_TIN_ACCESS_READINESS.status,
    "BLOCKED_UNVERIFIED_DEVICE_BINDING",
  );
  assert.equal(LIT_SOLANA_TIN_ACCESS_READINESS.safeForTinMasterSeeds, false);
  assert.match(
    LIT_SOLANA_TIN_ACCESS_READINESS.reason,
    /authorized-device binding/i,
  );
});
