import assert from "node:assert/strict";
import { createCaseDependencies } from "./create-case-dependencies.mjs";
import { createReadyWork } from "./create-ready-work.mjs";
import { attachmentParams } from "./attachment-params.mjs";
import { readWork } from "./read-work.mjs";
import { responseJson } from "./response-json.mjs";
import { requestJson } from "./request-json.mjs";
import { requireNodeService } from "./require-node-service.mjs";

/** The guarded HTTP attachment requires Node authentication and returns the same durable work. */
export async function fundingRouteTest(fixture) {
  const context = createCaseDependencies(fixture);
  const { work } = await createReadyWork(context);
  const params = attachmentParams(work), calls = [];
  const routeDependencies = { NextResponse: { json: responseJson }, requireService: requireNodeService.bind(null, calls),
    attachSignedFunding: context.attach };
  const before = await readWork(context, work.id);
  const denied = await context.postSignedFunding(routeDependencies, { credential: "wrong", json: requestJson.bind(null, params) });
  assert.equal(denied.status, 401);
  assert.deepEqual(await readWork(context, work.id), before);
  const invalid = await context.postSignedFunding(routeDependencies, { credential: "synthetic-node-credential",
    json: requestJson.bind(null, { ...params, expectedVersion: "3" }) });
  assert.equal(invalid.status, 409);
  assert.deepEqual(await readWork(context, work.id), before);
  const accepted = await context.postSignedFunding(routeDependencies, { credential: "synthetic-node-credential", json: requestJson.bind(null, params) });
  assert.equal(accepted.status, 200);
  assert.equal(accepted.data.work.id, work.id);
  assert.equal(accepted.data.work.fundingPhase, "SIGNED_DEPOSIT");
  const conflict = await context.postSignedFunding(routeDependencies, { credential: "synthetic-node-credential",
    json: requestJson.bind(null, { ...params, senderSignedFundingTransaction: "changed-wire" }) });
  assert.equal(conflict.status, 409);
  assert.deepEqual(calls, ["node", "node", "node", "node"]);
}
