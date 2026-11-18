import assert from "node:assert/strict";
import { createCaseDependencies } from "./create-case-dependencies.mjs";

/** Nonce ownership is replay-safe for the same work binding and exclusive against other bindings. */
export async function nonceClaimTest(fixture) {
  const context = createCaseDependencies(fixture);
  const body = { operation: "claim_once", key: "synthetic-owner-nonces", field: "synthetic-nonce",
    value: "same-work-id:immutable-authorization-commitment" };
  const first = await context.executeState(body);
  assert.equal(first.claimed, true);
  assert.deepEqual(await context.executeState(body), first);
  const other = await context.executeState({ ...body, value: "different-work-id:different-authorization-commitment" });
  assert.equal(other.claimed, false);
  assert.deepEqual(await context.executeState({ operation: "hget", key: body.key, field: body.field }), { value: body.value });
  const race = { ...body, field: "racing-nonce" };
  const results = await Promise.all([context.executeState(race), context.executeState({ ...race, value: "competing-work-binding" })]);
  let accepted = 0;
  for (const result of results) if (result.claimed) accepted += 1;
  assert.equal(accepted, 1);
  const stored = await context.executeState({ operation: "hget", key: race.key, field: race.field });
  assert.equal((await context.executeState({ ...race, value: stored.value })).claimed, true);
}
