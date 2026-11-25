import assert from "node:assert/strict";
import test from "node:test";
import { createCrankerWakeGate } from "../src/receiver/wake-gate.js";

test("idle lanes share read-only polling and authenticate only periodic recovery claims", async () => {
  let now = 0, reads = 0, claims = 0;
  const gate = createCrankerWakeGate({ clock: () => now, pollMs: 2000,
    recoveryMs: lane => lane === "FUNDING" ? 10000 : 60000,
    readCursor: async () => { reads++; return "unchanged"; } });
  for (now = 0; now < 24 * 60 * 60_000; now += 2000) {
    const eligible = await Promise.all([gate.shouldClaim("FUNDING"), gate.shouldClaim("NATIVE")]);
    claims += eligible.filter(Boolean).length;
  }
  assert.equal(claims, 10080);
  assert.equal(reads, 43200);
});

test("a changed hint wakes both lanes and a busy lane drains without additional hint reads", async () => {
  let now = 0, cursor = "first", reads = 0;
  const gate = createCrankerWakeGate({ clock: () => now, pollMs: 2000,
    readCursor: async () => { reads++; return cursor; } });
  assert.deepEqual(await Promise.all([gate.shouldClaim("FUNDING"), gate.shouldClaim("NATIVE")]), [true, true]);
  now = 2000;
  assert.deepEqual(await Promise.all([gate.shouldClaim("FUNDING"), gate.shouldClaim("NATIVE")]), [false, false]);
  cursor = "second"; now = 4000;
  assert.deepEqual(await Promise.all([gate.shouldClaim("FUNDING"), gate.shouldClaim("NATIVE")]), [true, true]);
  gate.receivedWork("FUNDING", true);
  const before = reads;
  for (let i = 0; i < 5; i++) assert.equal(await gate.shouldClaim("FUNDING"), true);
  assert.equal(reads, before);
  gate.receivedWork("FUNDING", false);
  assert.equal(await gate.shouldClaim("FUNDING"), false);
});

test("failed hint reads retain periodic recovery, and failed claims retain normal retries", async () => {
  let now = 0;
  const gate = createCrankerWakeGate({ clock: () => now, pollMs: 2000,
    readCursor: async () => { throw new Error("read unavailable"); } });
  assert.equal(await gate.shouldClaim("NATIVE"), true);
  now = 2000;
  assert.equal(await gate.shouldClaim("NATIVE"), false);
  now = 60000;
  assert.equal(await gate.shouldClaim("NATIVE"), true);
  gate.receivedWork("NATIVE", true);
  now = 62000;
  assert.equal(await gate.shouldClaim("NATIVE"), true);
  gate.receivedWork("NATIVE", false);
  assert.equal(await gate.shouldClaim("NATIVE"), false);
});
