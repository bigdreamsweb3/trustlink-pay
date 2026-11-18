import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { compileReceiverFixture } from "../../support/compile-receiver-fixture.mjs";
import { loadReceiverFixtureModule } from "../shared/load-receiver-fixture-module.mjs";

/** Compile direct Receiver ports only; explicit case contexts never load operator storage. */
export async function createStagedFixture() {
  const directory = await mkdtemp(path.join(tmpdir(), "tsn-receiver-staged-funding-"));
  await compileReceiverFixture(directory, [
    "work-contract.ts", "work/receive.ts", "work/attach-signed-funding.ts",
    "work/getWorkForNode.ts", "work/leaseForNode.ts", "work/leaseForCranker.ts", "work/transition.ts",
    "storage/local/local-db.ts", "storage/local/create-store-context.ts",
    "security/node-envelope/encrypt-payload-for-node.ts", "security/node-envelope/decrypt-payload-for-node.ts",
    "security/node-attestation/assert-node-verification-attestation.ts", "state/node-key-value/execute-state-operation.ts",
    "http/api/work-status/by-id/GET.ts", "http/api/internal/node/work/funding/POST.ts",
    "http/api/internal/node/work/POST.ts",
  ]);
  const load = loadReceiverFixtureModule.bind(null, directory);
  const contract = await load("work-contract");
  const { LocalDb } = await load("storage/local/local-db");
  const { createStoreContext } = await load("storage/local/create-store-context");
  const { encryptPayloadForNode } = await load("security/node-envelope/encrypt-payload-for-node");
  const { decryptPayloadForNode } = await load("security/node-envelope/decrypt-payload-for-node");
  const { assertNodeVerificationAttestation } = await load("security/node-attestation/assert-node-verification-attestation");
  const { nodeCommitment } = await load("security/node-attestation/node-commitment");
  const { attestationMessage } = await load("security/node-attestation/attestation-message");
  const { receive } = await load("work/receive");
  const { attachSignedFunding } = await load("work/attach-signed-funding");
  const { getWorkForNode } = await load("work/getWorkForNode");
  const { leaseForNode } = await load("work/leaseForNode");
  const { leaseForCranker } = await load("work/leaseForCranker");
  const { transition } = await load("work/transition");
  const { executeStateOperation } = await load("state/node-key-value/execute-state-operation");
  const { GET: getPublicStatus } = await load("http/api/work-status/by-id/GET");
  const { POST: postSignedFunding } = await load("http/api/internal/node/work/funding/POST");
  const { POST: postNodeWork } = await load("http/api/internal/node/work/POST");
  const { claimWorkTransaction } = await load("work/claim-work-transaction");
  const { reclaimExpiredWorkLease } = await load("work/reclaim-expired-work-lease");
  return { directory, contract, LocalDb, createStoreContext, encryptPayloadForNode, decryptPayloadForNode,
    assertNodeVerificationAttestation, nodeCommitment, attestationMessage, receive, attachSignedFunding,
    getWorkForNode, leaseForNode, leaseForCranker, transition, executeStateOperation, getPublicStatus, postSignedFunding,
    postNodeWork, claimWorkTransaction, reclaimExpiredWorkLease };
}
