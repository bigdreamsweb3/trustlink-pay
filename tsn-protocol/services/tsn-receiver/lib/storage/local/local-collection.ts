import { Query } from "./query";
import { collectionDoc } from "./collection-doc";
import type { StorageContext } from "./types";
export class LocalCollection extends Query {
  doc = collectionDoc;
  constructor(context: StorageContext, public name: string) { super(context,name); }
}
