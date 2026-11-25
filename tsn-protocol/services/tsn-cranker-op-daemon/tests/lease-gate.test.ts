import assert from "node:assert/strict";
import test from "node:test";
import { createCrankerLeaseGate } from "../src/receiver/lease-gate.js";

test("both work lanes share a 30-per-minute lease admission budget", async () => {
  let now = 1, claims = 0;
  const admitted: number[] = [];
  const gate = createCrankerLeaseGate({ clock: () => now, sleep: async delay => { now += delay; } });
  await Promise.all(Array.from({ length: 6 }, async () => {
    await gate(); admitted.push(now); claims++;
  }));
  assert.equal(claims, 6);
  assert.deepEqual(admitted, [1, 2001, 4001, 6001, 8001, 10001]);
});

test("a slow native lease response does not hold the funding admission turn", async () => {
  let now = 1;
  const blocked = Promise.withResolvers<void>();
  const gate = createCrankerLeaseGate({ clock: () => now, sleep: async delay => { now += delay; } });
  const native = (async () => { await gate(); await blocked.promise; })();
  await gate();
  assert.equal(now, 2001);
  blocked.resolve(); await native;
});
