import assert from "node:assert/strict";
import { responseJson } from "./response-json.mjs";
import { requestJson } from "./request-json.mjs";
import { requireNodeService } from "./require-node-service.mjs";
import { captureNodeWorkLease } from "./capture-node-work-lease.mjs";

/** Validate the optional fast pass before leasing, while preserving authenticated unfiltered calls. */
export async function signedFundingFilterRouteTest(fixture) {
  const services = [], claims = [];
  const dependencies = { NextResponse: { json: responseJson }, requireService: requireNodeService.bind(null, services),
    leaseForNode: captureNodeWorkLease.bind(null, claims) };
  const body = { nodeId: "fast-node", supportedKinds: ["AUTHORIZED_FUNDING"], fundingPhase: "SIGNED_DEPOSIT" };
  const denied = await fixture.postNodeWork(dependencies, { credential: "wrong", json: requestJson.bind(null, body) });
  assert.equal(denied.status, 401);
  assert.equal(claims.length, 0);
  for (const change of [{ fundingPhase: "UNKNOWN" }, { fundingPhase: null }, { fundingPhase: true },
    { supportedKinds: undefined }, { supportedKinds: "AUTHORIZED_FUNDING" }, { supportedKinds: [] },
    { supportedKinds: ["SETTLEMENT"] }, { supportedKinds: ["AUTHORIZED_FUNDING", "SETTLEMENT"] }]) {
    const invalid = await fixture.postNodeWork(dependencies, { credential: "synthetic-node-credential", json: requestJson.bind(null, { ...body, ...change }) });
    assert.equal(invalid.status, 400);
    assert.equal(invalid.data.error, "INVALID_NODE_FUNDING_FILTER");
  }
  assert.equal(claims.length, 0, "invalid filters must never call the persistence port");
  const accepted = await fixture.postNodeWork(dependencies, { credential: "synthetic-node-credential", json: requestJson.bind(null, body) });
  assert.equal(accepted.status, 200);
  assert.deepEqual(claims, [{ owner: "fast-node", supportedKinds: ["AUTHORIZED_FUNDING"], fundingPhase: "SIGNED_DEPOSIT" }]);
  const authorization = await fixture.postNodeWork(dependencies, { credential: "synthetic-node-credential", json: requestJson.bind(null, { ...body, fundingPhase: "AUTHORIZATION" }) });
  assert.equal(authorization.status, 200);
  assert.deepEqual(claims[1], { owner: "fast-node", supportedKinds: ["AUTHORIZED_FUNDING"], fundingPhase: "AUTHORIZATION" });
  const ordinary = await fixture.postNodeWork(dependencies, { credential: "synthetic-node-credential", json: requestJson.bind(null, { nodeId: "ordinary-node" }) });
  assert.equal(ordinary.status, 200);
  assert.deepEqual(claims[2], { owner: "ordinary-node", supportedKinds: undefined, fundingPhase: undefined });
}
