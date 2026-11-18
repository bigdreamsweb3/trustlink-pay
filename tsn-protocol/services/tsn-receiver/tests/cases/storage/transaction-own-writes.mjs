export async function transactionOwnWrites(collection,query,transaction) {
  const page=await transaction.get(query);
  const next=await transaction.get(query.startAfter(page.docs.at(-1)));
  transaction.update(collection.doc("epoch-099"),{status:"VERIFIED"});
  const ownWrites=await transaction.get(collection.where("status","==","VERIFIED"));
  return {page,next,ownWrites};
}
