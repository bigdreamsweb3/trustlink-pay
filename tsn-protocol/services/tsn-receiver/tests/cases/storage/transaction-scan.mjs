import assert from "node:assert/strict";
export async function transactionScan(collection,failed,transaction) {
  const fresh = await transaction.get(failed);
  assert.equal(fresh.get("stateVersion"),167);
  let after; let scanned=0;
  while (true) {
    let query=collection.where("kind","==","TCAP_EPOCH_ACCOUNTING").orderBy("__name__");
    if (after) query=query.startAfter(after);
    const page=await transaction.get(query.limit(200));
    for (const row of page.docs) { assert.equal(row.ref.id,row.id); assert.equal(row.get("kind"),"TCAP_EPOCH_ACCOUNTING"); assert.equal(row.get("status"),"FAILED"); }
    scanned+=page.docs.length;
    if (page.docs.length<200) break;
    after=page.docs.at(-1);
  }
  transaction.update(failed,{status:"RECEIVED",stateVersion:168,result:null});
  return scanned;
}
