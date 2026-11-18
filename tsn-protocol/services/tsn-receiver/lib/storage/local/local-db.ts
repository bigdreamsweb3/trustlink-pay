import { localContext } from "./runtime";
import { dbCollection } from "./db-collection";
import { dbBatch } from "./db-batch";
import { dbRunTransaction } from "./db-run-transaction";
import type { StorageContext } from "./types";
export class LocalDb {
  collection = dbCollection; batch = dbBatch; runTransaction = dbRunTransaction;
  constructor(public context: StorageContext = localContext) {}
}
