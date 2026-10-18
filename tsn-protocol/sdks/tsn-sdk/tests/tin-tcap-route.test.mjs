import assert from "node:assert/strict";
import test from "node:test";
import { deriveGpruElgamalKeyCommitment } from "../dist/gpru.js";
import { validateTinTipRoute } from "../dist/tins.js";

test("current GPRU route accepts a blinded TIP seed and rejects mismatched bindings", () => {
  const gpruPublicKey = new Uint8Array(32).fill(4);
  const valid = {
    tipRouteVersion: 1,
    gpruElgamalKeyVersion: 1,
    gpruElgamalPublicKey: gpruPublicKey,
    gpruElgamalKeyCommitment: deriveGpruElgamalKeyCommitment(1, gpruPublicKey),
    policyCommitment: new Uint8Array(32).fill(6),
  };
  assert.equal(validateTinTipRoute(valid), true);
  assert.equal(validateTinTipRoute({ ...valid, gpruElgamalKeyCommitment: new Uint8Array(32) }), false);
  assert.equal(validateTinTipRoute({
    ...valid,
    gpruElgamalKeyCommitment: deriveGpruElgamalKeyCommitment(1, new Uint8Array(32).fill(5)),
  }), false);
});
