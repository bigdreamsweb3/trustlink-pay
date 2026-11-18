

export async function runTransactionCase12(captures, tx) {
    tx.create(captures.verifyEpochsPaginateDeferAndSerializeAcrossConcurrentNodesContext.workCollection.doc(captures.verifyEpochsPaginateDeferAndSerializeAcrossConcurrentNodesContext.funding.id), captures.verifyEpochsPaginateDeferAndSerializeAcrossConcurrentNodesContext.funding);
    tx.create(captures.verifyEpochsPaginateDeferAndSerializeAcrossConcurrentNodesContext.workCollection.doc(captures.verifyEpochsPaginateDeferAndSerializeAcrossConcurrentNodesContext.credit.id), captures.verifyEpochsPaginateDeferAndSerializeAcrossConcurrentNodesContext.credit);
    tx.update(captures.verifyEpochsPaginateDeferAndSerializeAcrossConcurrentNodesContext.workCollection.doc(captures.verifyEpochsPaginateDeferAndSerializeAcrossConcurrentNodesContext.epoch.id), { status: "FAILED", result: { signature: "uncertain" } });
}
