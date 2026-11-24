import { createHash, sign } from "node:crypto";
import assert from "node:assert/strict";
import { createCaseDependencies } from "./create-case-dependencies.mjs";
import { readWork } from "./read-work.mjs";

/** Private debit ingress preserves exact retries and never publishes its opening. */
export async function tinDebitIngressTest(fixture) {
  const context = createCaseDependencies(fixture);
  const payload = { paymentId: "private-debit", senderTin: "1234567890", recipientTin: "2345678901",
    tokenMintAddress: "11111111111111111111111111111111", amountBaseUnits: "30", nonce: "789", amountBlinding: "123",
    deploymentCommitment: "01".repeat(32), validAfterSlot: "10", expiresAtSlot: "200",
    approval: { ownerPublicKey: "01".repeat(32), signature: "02".repeat(64) }, senderOpening: { balance: "100", blinding: "17" } };
  const input = { id: payload.paymentId, kind: "TIN_DEBIT", payload };
  const work = await context.receive(input);
  const stored = await readWork(context, work.id);
  assert.deepEqual((await context.forNode(work.id)).payload, payload);
  assert.doesNotMatch(JSON.stringify(stored), /senderTin|recipientTin|amountBaseUnits|senderOpening|balance|blinding/);
  assert.deepEqual(fixture.contract.publicCoordinationPayload(stored), { paymentId: payload.paymentId });
  assert.deepEqual(await context.receive(input), stored);
  assert.deepEqual(context.nodeWakes, ["TIN_DEBIT"]);
  await assert.rejects(context.receive({ ...input, payload: { ...payload, nonce: "790" } }), /IDEMPOTENCY_CONFLICT/);
  await assert.rejects(context.receive({ ...input, payload: { ...payload, recipientTin: payload.senderTin } }), /IDENTITY_INVALID/);
  assert.equal(await context.leaseCranker("synthetic-cranker", ["TIN_DEBIT"]), null);
  const response = await fixture.postWork({ ...context.dependencies,
    requireService: () => { throw new Error("UNAUTHORIZED_SERVICE"); },
    receive: () => assert.fail("Unauthenticated debit reached storage"),
    NextResponse: { json: (data, options) => ({ data, status: options?.status ?? 200 }) },
  }, { json: async () => input });
  assert.equal(response.status, 401);
  assert.equal(response.data.error, "UNAUTHORIZED_SERVICE");
  const leased = await context.leaseNode("synthetic-node", ["TIN_DEBIT"]);
  assert.deepEqual(leased.payload, payload);
  assert.equal(leased.status, "NODE_VERIFYING");
  const durable = await readWork(context, work.id);
  assert.doesNotMatch(JSON.stringify(durable), /senderTin|recipientTin|senderOpening|balance|blinding/);
  const accountFields = ["authority","motherEscrow","tcapProgram","tsnProgram","config","assetEntry","commitmentRoot","reserveState","authorizationSigner","tipRouteRoot","tinDebitVerifier","instructions","gpruProgram","tipProgram"];
  const transition = { ...Object.fromEntries(accountFields.map(name => [name,"11111111111111111111111111111111"])),
    proof:{publicInputs:Array(26).fill("01".repeat(32)),proofA:"01".repeat(64),proofB:"02".repeat(128),proofC:"03".repeat(64)},
    memoPayloads:["encrypted sender","encrypted recipient"],authorizationDigest:"01".repeat(32),tokenId:1,
    amountCommitment:"02".repeat(32),authorizationCommitment:"03".repeat(32),actionCommitment:"04".repeat(32),nullifier:"05".repeat(32),
    previousTcapRoot:"06".repeat(32),newTcapRoot:"07".repeat(32),tcapRootSequence:"5",validAfterSlot:"10",expiresAtSlot:"200",deploymentCommitment:"08".repeat(32) };
  const evidence = { verificationType:"TSN_TIN_DEBIT_V1",verifiedPayload:{tcapTinDebitTransition:transition},
    receiverLease:{source:"tsn-receiver",workId:leased.id,kind:leased.kind,stateVersion:leased.stateVersion,payloadCommitment:leased.payloadCommitment} };
  const attestation = { version:1,algorithm:"Ed25519",workId:leased.id,workKind:leased.kind,decision:"VERIFIED",
    inputPayloadCommitment:leased.payloadCommitment,evidenceCommitment:context.nodeCommitment(evidence),
    executionPayloadCommitment:context.nodeCommitment(evidence.verifiedPayload),verificationType:evidence.verificationType,
    leaseId:leased.nodeLease.leaseId,leaseVersion:leased.nodeLease.version,nodeId:leased.nodeLease.owner,
    keyId:createHash("sha256").update(context.nodePublic).digest("hex").slice(0,24),signedAt:new Date().toISOString() };
  attestation.signatureBase64=sign(null,context.attestationMessage(attestation),context.nodeKeys.privateKey).toString("base64");
  evidence.nodeAttestation=attestation;
  const params={id:leased.id,actor:"node",owner:"synthetic-node",expectedVersion:leased.stateVersion,status:"VERIFIED",evidence};
  await assert.rejects(context.transition({...params,evidence:{...evidence,verifiedPayload:{tcapTinDebitTransition:{...transition,tokenId:2}}}}),/NODE_ATTESTATION_CONTEXT_MISMATCH/);
  const verified=await context.transition(params);
  assert.deepEqual(fixture.contract.crankerExecutionPayload("TIN_DEBIT",fixture.contract.verifiedPayloadForWork(verified)),{tcapTinDebitTransition:transition});
  const projected=await context.forNode(verified.id);
  assert.deepEqual(projected.payload,payload);
  assert.deepEqual(context.crankerWakes,["VERIFIED"]);
  const secondPayload={...payload,paymentId:"second-private-debit"};
  await context.receive({id:secondPayload.paymentId,kind:"TIN_DEBIT",payload:secondPayload});
  assert.equal(await context.leaseNode("synthetic-node",["TIN_DEBIT"]),null);
  const cranker=await context.leaseCranker("synthetic-cranker",["TIN_DEBIT"]);
  assert.equal(cranker.id,verified.id);
  assert.ok(Date.parse(cranker.crankerLease.expiresAt)-Date.now()>170000);
}
