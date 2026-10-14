import assert from "node:assert/strict";
import test from "node:test";
import { deriveTcapTipRootCommitment } from "../dist/gpru.js";
import { validateTinTcapRelationship } from "../dist/tins.js";

test("current GPRU route accepts a blinded TIP seed and rejects mismatched bindings", () => {
  const gpruCommitment = new Uint8Array(32).fill(4);
  const valid = {
    tcapRouteVersion: 1,
    tcapRelationshipCommitment: gpruCommitment,
    tcapRelationshipReference: deriveTcapTipRootCommitment(gpruCommitment),
    tcapPolicyCommitment: new Uint8Array(32).fill(6),
  };
  assert.equal(validateTinTcapRelationship(valid), true);
  assert.equal(validateTinTcapRelationship({ ...valid, tcapRelationshipReference: new Uint8Array(32) }), false);
  assert.equal(validateTinTcapRelationship({
    ...valid,
    tcapRelationshipReference: deriveTcapTipRootCommitment(new Uint8Array(32).fill(5)),
  }), false);
});
