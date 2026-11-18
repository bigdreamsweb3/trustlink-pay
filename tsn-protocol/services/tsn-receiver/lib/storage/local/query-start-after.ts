import { Query } from "./query";
import type { Snap } from "./snap";
export function queryStartAfter(this: Query, snapshot: Snap) { return new Query(this.context, this.collectionPath, this.filters, this.order, this.max, snapshot.id); }
