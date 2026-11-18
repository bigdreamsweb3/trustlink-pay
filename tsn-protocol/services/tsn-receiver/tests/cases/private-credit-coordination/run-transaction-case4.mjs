

export async function runTransactionCase4(captures, tx) {
    for (let i = 0; i < 210; i++) {
        const work = captures.verifyEpochsPaginateDeferAndSerializeAcrossConcurrentNodesContext.createReceivedWork({ id: "a" + String(i).padStart(4, "0"), kind: "TCAP_EPOCH_ACCOUNTING", payload: {} });
        tx.create(captures.verifyEpochsPaginateDeferAndSerializeAcrossConcurrentNodesContext.workCollection.doc(work.id), { ...work, deferredUntil: new Date(Date.now() + 60000).toISOString() });
    }
    const epoch = captures.verifyEpochsPaginateDeferAndSerializeAcrossConcurrentNodesContext.createReceivedWork({ id: captures.verifyEpochsPaginateDeferAndSerializeAcrossConcurrentNodesContext.epochId, kind: "TCAP_EPOCH_ACCOUNTING", payload: {} });
    tx.create(captures.verifyEpochsPaginateDeferAndSerializeAcrossConcurrentNodesContext.workCollection.doc(epoch.id), epoch);
}
