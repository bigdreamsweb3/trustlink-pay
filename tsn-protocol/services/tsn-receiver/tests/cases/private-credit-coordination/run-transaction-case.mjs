

export async function runTransactionCase(captures, tx) {
    return tx.update(captures.verifyEpochsPaginateDeferAndSerializeAcrossConcurrentNodesContext.workCollection.doc(captures.verifyEpochsPaginateDeferAndSerializeAcrossConcurrentNodesContext.enqueuedId), { deferredUntil: new Date(Date.now() + 60000).toISOString() });
}
