import type { WorkKind, WorkCreationDependencies, ReceiverWork } from "../models";
import { DEFAULT_WORK_CREATION_DEPENDENCIES } from "../constants";
import { assertDurablePayload } from "../validation/assert-durable-payload";
import { payloadCommitment } from "../commitments/payload-commitment";

/**
 * Validate the supplied durable input and create its existing initial identity, timestamps and empty coordination fields.
 * Input: the explicit typed parameters below. Output: ReceiverWork with RECEIVED stateVersion 1 and the original supplied/derived commitment.
 * Dependencies: named imports and the narrow clock/identity port.
 * Errors: Durable validation and supplied clock/identity dependency errors propagate.
 * Verification: existing Receiver contract/coordination/recovery fixtures; individual branch coverage is unmeasured.
 */
export function createReceivedWork(input: { id?: string; kind: WorkKind; payload: Record<string, unknown>; payloadCommitment?: string }, dependencies: WorkCreationDependencies = DEFAULT_WORK_CREATION_DEPENDENCIES) {
  assertDurablePayload(input.kind, input.payload);
  const now = new dependencies.clock().toISOString();
  return {
    id: input.id?.trim() || dependencies.randomUUID(),
    kind: input.kind,
    status: "RECEIVED",
    stateVersion: 1,
    payloadCommitment: input.payloadCommitment ?? payloadCommitment(input.payload),
    payload: input.payload,
    receivedAt: now,
    updatedAt: now,
    nodeLease: null,
    crankerLease: null,
    verification: null,
    result: null,
    authorization: null,
  } satisfies ReceiverWork;
}
