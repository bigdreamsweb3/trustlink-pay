import assert from "node:assert/strict";
import { createHash } from "node:crypto";

/** Failed paired debit resolves from an expired unchanged root without a funding work. */
export async function debitWithoutFunding(context) {
  const { work, transition, createReceivedWork, workCollection, db, resolveFailedSettlement,
    hasResolvedNonExecution, rpcFixture, setWakeCheck, assertDurableResolutionBeforeWake, payloadCommitment, getPublicStatus } = context;
  const fields = ["authority","motherEscrow","tcapProgram","tsnProgram","config","assetEntry","reserveState","authorizationSigner","tipRouteRoot","tinDebitVerifier","instructions","gpruProgram","tipProgram"];
  const t = Object.fromEntries(fields.map(name => [name,"11111111111111111111111111111111"]));
  const h = value => BigInt(value).toString(16).padStart(64,"0");
  const inputs = Array(26).fill(h(1));inputs[0]=transition.previousTcapRoot;inputs[3]=h(5);inputs[6]=h(850);inputs[7]=h(900);
  Object.assign(t,{commitmentRoot:transition.commitmentRoot,proof:{publicInputs:inputs,proofA:"01".repeat(64),proofB:"02".repeat(128),proofC:"03".repeat(64)},memoPayloads:["encrypted sender","encrypted recipient"],
    authorizationDigest:h(9),tokenId:1,amountCommitment:h(10),authorizationCommitment:h(11),actionCommitment:h(12),nullifier:h(13),
    previousTcapRoot:transition.previousTcapRoot,newTcapRoot:h(14),tcapRootSequence:"6",validAfterSlot:"850",expiresAtSlot:"900",deploymentCommitment:h(15)});
  const payload={paymentId:"failed-private-debit",nodeEncryptedPayload:{version:1,ciphertext:"synthetic"}};
  const debit={...work,id:payload.paymentId,kind:"TIN_DEBIT",payload,payloadCommitment:payloadCommitment(payload),
    verification:{verificationType:"TSN_TIN_DEBIT_V1",payloadDelta:{addedFields:{tcapTinDebitTransition:t},changedFields:{},removedFields:[]}},
    authorization:{...work.authorization,kind:"TSN_TCAP_GPRU_TIN_DEBIT_AUTHORIZATION_V1",transition:t,leaseId:payload.paymentId},
    result:{...work.result,stage:"TCAP_GPRU_TIN_DEBIT_V1_SIGNED",wireBytes:2977}};
  await workCollection.doc(debit.id).set(debit);
  const statusDependencies = { NextResponse: { json: data => data }, createHash,
    getWork: async () => (await workCollection.doc(debit.id).get()).data() };
  const statusContext = { params: Promise.resolve({ id: debit.id }) };
  assert.equal((await getPublicStatus(statusDependencies, {}, statusContext)).safeToReplace, false);
  await db.collection("tsn_private_credit_locks").doc("global-root").set({workId:debit.id});
  setWakeCheck(assertDurableResolutionBeforeWake.bind(null,hasResolvedNonExecution,workCollection,debit.id));
  rpcFixture();
  const params={id:debit.id,expectedVersion:debit.stateVersion,signature:debit.result.signature,execute:false};
  assert.equal((await resolveFailedSettlement(params)).executed,false);
  assert.deepEqual((await workCollection.doc(debit.id).get()).data(),debit);
  rpcFixture();
  const resolved=await resolveFailedSettlement({...params,execute:true});
  const stored=(await workCollection.doc(debit.id).get()).data();
  assert.equal(resolved.executed,true);assert.equal(hasResolvedNonExecution(stored),true);
  assert.deepEqual(stored.payload,payload);assert.deepEqual(stored.result,debit.result);
  assert.equal("fundingWorkId" in stored.nonExecutionResolution,false);
  assert.equal(stored.nonExecutionHistory.length,1);
  assert.equal((await getPublicStatus(statusDependencies, {}, statusContext)).safeToReplace, true);
  await workCollection.doc(debit.id).set({ ...stored, stateVersion: stored.stateVersion + 1 });
  assert.equal((await getPublicStatus(statusDependencies, {}, statusContext)).safeToReplace, false);
}
