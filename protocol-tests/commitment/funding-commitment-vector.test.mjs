import assert from "node:assert/strict";
import test from "node:test";
import { computeV1FundingCommitment, loadFundingCommitmentVector } from "./funding-commitment-vector.mjs";

test("shared TCAP V1 funding commitment vector is stable", async () => {
  const vector = await loadFundingCommitmentVector();
  const computed = computeV1FundingCommitment(vector);
  assert.equal(computed.authorizationCommitmentHex, vector.expectedAuthorizationCommitmentHex);
  assert.equal(computed.preimageLength, vector.expectedPreimageLength);
  assert.equal(computed.preimageHex, vector.expectedPreimageHex);
  assert.equal(computed.commitmentHex, vector.expectedCommitmentHex);
});
