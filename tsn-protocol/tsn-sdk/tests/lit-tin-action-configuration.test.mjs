import assert from "node:assert/strict";
import { test } from "node:test";

import {
  assertLitTinActionConfiguration,
  getLitTinActionReadiness,
} from "../dist/lit-tin-action-configuration.js";

const valid = {
  runtime: "lit-chipotle-action",
  apiBaseUrl: "https://api.dev.litprotocol.com/core/v1",
  actionCid: `b${"a".repeat(58)}`,
  actionSourceSha256: "1".repeat(64),
  pkpId: "tsn-tin-key-vault",
  groupId: "tsn-tin-authorized-device-group",
  replayProtection: {
    mode: "ATOMIC_NONCE_REGISTRY",
    endpoint: "https://nonce.tsn.example/access",
    audience: "tsn-tin-threshold-access",
    verifierPublicKey: "public-verifier-key",
  },
};

test("Lit TIN action configuration fails closed when immutable authority is absent", () => {
  const readiness = getLitTinActionReadiness(null);
  assert.equal(readiness.ready, false);
  assert.equal(readiness.status, "BLOCKED_ACTION_CONFIGURATION");
  assert.throws(() => assertLitTinActionConfiguration({}), /not ready/);
});

test("Lit TIN action configuration rejects mutable, insecure, or credential-bearing URLs", () => {
  const readiness = getLitTinActionReadiness({
    ...valid,
    apiBaseUrl: "http://user:secret@example.com/core/v1?apiKey=secret",
    actionCid: "latest-action",
    replayProtection: {
      ...valid.replayProtection,
      endpoint: "http://example.com/nonce?token=secret",
    },
  });
  assert.equal(readiness.ready, false);
  assert.match(readiness.errors.join(" "), /HTTPS/);
  assert.match(readiness.errors.join(" "), /credentials/);
  assert.match(readiness.errors.join(" "), /IPFS CID/);
});

test("Lit TIN action configuration accepts pinned public metadata only", () => {
  const configuration = assertLitTinActionConfiguration(valid);
  assert.equal(configuration.actionSourceSha256, "1".repeat(64));
  assert.equal("apiKey" in configuration, false);
  assert.equal("secret" in configuration, false);
});
