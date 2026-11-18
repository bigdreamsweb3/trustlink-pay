

export async function runTransactionCase13(captures, tx) {
    return tx.update(captures.verifyEpochsPaginateDeferAndSerializeAcrossConcurrentNodesContext.workCollection.doc(captures.verifyEpochsPaginateDeferAndSerializeAcrossConcurrentNodesContext.epoch.id), { status: "CONFIRMED" });
}
