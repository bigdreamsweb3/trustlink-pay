import { Query } from "./query";
export function queryWhere(this: Query, field: string, operator: string, value: unknown) { return new Query(this.context, this.collectionPath, [...this.filters, [field,operator,value]], this.order, this.max, this.after); }
