import { Query } from "./query";
export function queryLimit(this: Query, value: number) { return new Query(this.context, this.collectionPath, this.filters, this.order, value, this.after); }
