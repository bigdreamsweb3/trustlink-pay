import assert from "node:assert/strict";
import test from "node:test";
import { FUNDING_WORK_KINDS, NATIVE_WORK_KINDS, runCrankerWorkLoop, type CrankerWorkKind } from "../src/receiver/work-loop.js";

test("funding completes while native authorization remains blocked", async () => {
  const stop = new AbortController();
  const nativeStarted = Promise.withResolvers<void>();
  const releaseNative = Promise.withResolvers<void>();
  const fundingCompleted = Promise.withResolvers<void>();
  const failures: unknown[] = [];
  const kinds: readonly (readonly CrankerWorkKind[])[] = [FUNDING_WORK_KINDS, NATIVE_WORK_KINDS];
  const loops = kinds.map(supportedKinds => runCrankerWorkLoop({
    supportedKinds, signal: stop.signal, pollMs: 2000,
    lease: async requested => ({ kind: requested[0] }),
    process: async work => {
      if (work.kind === "AUTHORIZED_FUNDING") { fundingCompleted.resolve(); stop.abort(); }
      else { nativeStarted.resolve(); await releaseNative.promise; }
    },
    sleep: async () => { throw new Error("unexpected polling"); },
    pollFailed: error => failures.push(error),
  }));
  try {
    await nativeStarted.promise;
    await fundingCompleted.promise;
    assert.deepEqual(failures, []);
  } finally {
    stop.abort(); releaseNative.resolve(); await Promise.all(loops);
  }
});

test("each lane processes one item at a time and preserves kind coverage", async () => {
  assert.deepEqual([...FUNDING_WORK_KINDS, ...NATIVE_WORK_KINDS].sort(),
    ["AUTHORIZED_FUNDING", "SETTLEMENT", "TIN_OPERATION", "TCAP_EPOCH_ACCOUNTING", "TIN_DEBIT"].sort());
  assert.equal(new Set([...FUNDING_WORK_KINDS, ...NATIVE_WORK_KINDS]).size, 5);
  const stop = new AbortController();
  let active = 0, maximum = 0, claims = 0;
  const processed: number[] = [];
  await runCrankerWorkLoop({
    supportedKinds: FUNDING_WORK_KINDS, signal: stop.signal, pollMs: 2000,
    lease: async () => ({ kind: "AUTHORIZED_FUNDING" as const, id: ++claims }),
    process: async work => {
      maximum = Math.max(maximum, ++active);
      await Promise.resolve(); processed.push(work.id); active--;
      if (processed.length === 3) stop.abort();
    },
    sleep: async () => { throw new Error("unexpected polling"); },
    pollFailed: error => { throw error; },
  });
  assert.equal(maximum, 1); assert.deepEqual(processed, [1, 2, 3]);
});

test("a claim failure backs off without executing or rebuilding a transaction", async () => {
  const stop = new AbortController();
  const failure = new Error("synthetic claim unavailable");
  const failures: unknown[] = [], sleeps: number[] = [];
  await runCrankerWorkLoop({
    supportedKinds: FUNDING_WORK_KINDS, signal: stop.signal, pollMs: 2000,
    lease: async () => { throw failure; },
    process: async () => { throw new Error("must not execute"); },
    sleep: async delay => { sleeps.push(delay); stop.abort(); },
    pollFailed: error => failures.push(error),
  });
  assert.deepEqual(failures, [failure]); assert.deepEqual(sleeps, [3000]);
});

test("an empty funding queue sleeps at the existing poll interval", async () => {
  const stop = new AbortController();
  const sleeps: number[] = [];
  await runCrankerWorkLoop({
    supportedKinds: FUNDING_WORK_KINDS, signal: stop.signal, pollMs: 2000,
    lease: async () => null,
    process: async () => { throw new Error("must not execute"); },
    sleep: async delay => { sleeps.push(delay); stop.abort(); },
    pollFailed: error => { throw error; },
  });
  assert.deepEqual(sleeps, [2000]);
});
