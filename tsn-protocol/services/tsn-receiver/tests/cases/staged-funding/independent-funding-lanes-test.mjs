import assert from "node:assert/strict";
import { createCaseDependencies } from "./create-case-dependencies.mjs";
import { createReadyWork } from "./create-ready-work.mjs";
import { attachmentParams } from "./attachment-params.mjs";
import { createAuthorization } from "./create-authorization.mjs";
import { readWork } from "./read-work.mjs";

/** Message preparation and signed verification can claim independently without sharing a funding item. */
export async function independentFundingLanesTest(fixture) {
  const context = createCaseDependencies(fixture);
  const { work } = await createReadyWork(context, "signed-independent");
  await context.attach(attachmentParams(work));
  await context.receive({ id: "unsigned-independent", kind: "AUTHORIZED_FUNDING", payload: createAuthorization("unsigned-independent") });
  const authorization = await context.leaseNode("ordinary-node", ["AUTHORIZED_FUNDING"], "AUTHORIZATION");
  assert.equal(authorization.id, "unsigned-independent");
  assert.equal(authorization.fundingPhase, "AUTHORIZATION");
  assert.equal((await readWork(context, work.id)).status, "RECEIVED");
  const ordinary = await context.leaseNode("ordinary-node", ["TIN_OPERATION", "SETTLEMENT", "TIN_DEBIT", "TCAP_EPOCH_ACCOUNTING"]);
  assert.equal(ordinary, null);
  const signed = await context.leaseNode("funding-node", ["AUTHORIZED_FUNDING"], "SIGNED_DEPOSIT");
  assert.equal(signed.id, work.id);
  assert.equal(signed.fundingPhase, "SIGNED_DEPOSIT");
  assert.equal(signed.status, "NODE_VERIFYING");
  assert.equal((await readWork(context, authorization.id)).status, "NODE_VERIFYING");
}
