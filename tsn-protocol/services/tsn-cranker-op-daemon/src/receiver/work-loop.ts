/** Each lane leases and completes one item at a time; funding and native work use disjoint kinds. */
export const FUNDING_WORK_KINDS = ["AUTHORIZED_FUNDING"] as const;
export const NATIVE_WORK_KINDS = ["SETTLEMENT", "TIN_OPERATION", "TCAP_EPOCH_ACCOUNTING", "TIN_DEBIT"] as const;
export type CrankerWorkKind = typeof FUNDING_WORK_KINDS[number] | typeof NATIVE_WORK_KINDS[number];

export async function runCrankerWorkLoop<T extends { kind: CrankerWorkKind }>(ports: {
  supportedKinds: readonly CrankerWorkKind[];
  lease: (kinds: readonly CrankerWorkKind[]) => Promise<T | null>;
  process: (work: T, claimMs: number) => Promise<void>;
  sleep: (milliseconds: number) => Promise<void>;
  pollMs: number;
  pollFailed: (error: unknown) => void;
  signal?: AbortSignal;
}): Promise<void> {
  while (!ports.signal?.aborted) {
    try {
      const started = performance.now();
      const work = await ports.lease(ports.supportedKinds);
      if (!work) {
        if (!ports.signal?.aborted) await ports.sleep(ports.pollMs);
        continue;
      }
      if (!ports.supportedKinds.includes(work.kind)) throw new Error("WORK_KIND_OUTSIDE_CRANKER_LANE");
      await ports.process(work, Math.round(performance.now() - started));
    } catch (error) {
      ports.pollFailed(error);
      if (!ports.signal?.aborted) await ports.sleep(3000);
    }
  }
}
