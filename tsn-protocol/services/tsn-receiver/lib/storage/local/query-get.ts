import { readCollection } from "./read-collection";
import type { Query } from "./query";
export async function queryGet(this: Query) { return this.evaluateSnapshot(await readCollection(this.context, this.collectionPath)); }
