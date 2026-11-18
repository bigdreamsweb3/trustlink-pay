import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";
export async function transactionExclusion(collection,failed,state,transaction) {
  state.entered.resolve();
  await state.inspect.promise;
  await delay(50);
  assert.equal(state.finished,false);
  const page=await transaction.get(collection.where("status","==","CRANKER_LEASED"));
  assert.deepEqual(page.docs,[]);
  transaction.update(failed,{audit:"snapshot-checked"});
}
