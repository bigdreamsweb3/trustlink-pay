import assert from "node:assert/strict";
import test from "node:test";
import { deriveTipRootCommitment } from "../dist/gpru.js";
import { validateTinTipRoute } from "../dist/tins.js";

test("current GPRU route accepts a blinded TIP seed and rejects mismatched bindings", () => {
  const gpruCommitment = new Uint8Array(32).fill(4);
  const valid = {
    tipRouteVersion: 1,
    gpruPublicCommitment: gpruCommitment,
    tipRootCommitment: deriveTipRootCommitment(gpruCommitment),
    policyCommitment: new Uint8Array(32).fill(6),
  };
  assert.equal(validateTinTipRoute(valid), true);
  assert.equal(validateTinTipRoute({ ...valid, tipRootCommitment: new Uint8Array(32) }), false);
  assert.equal(validateTinTipRoute({
    ...valid,
    tipRootCommitment: deriveTipRootCommitment(new Uint8Array(32).fill(5)),
  }), false);
});
