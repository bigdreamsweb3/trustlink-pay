import { createGate } from "../storage-scheduling/create-gate.mjs";
import { transactionExclusion } from "./transaction-exclusion.mjs";
import { competingWriteFinished } from "./competing-write-finished.mjs";
export async function runTransactionExclusion(db,other,collection,failed) {
  const state={finished:false,entered:createGate(),inspect:createGate()};
  const transaction=db.runTransaction(transactionExclusion.bind(null,collection,failed,state));
  let results;
  try {
    await Promise.race([state.entered.promise,transaction]);
    state.write=other.collection("work").doc("epoch-new").create({id:"epoch-new",kind:"TCAP_EPOCH_ACCOUNTING",status:"CRANKER_LEASED"}).then(competingWriteFinished.bind(null,state));
    state.inspect.resolve();
    results=await Promise.allSettled([transaction,state.write]);
  } finally {
    state.inspect.resolve();
    await Promise.allSettled([transaction,state.write]);
  }
  for(const result of results){if(result.status==="rejected")throw result.reason;}
  return state;
}
