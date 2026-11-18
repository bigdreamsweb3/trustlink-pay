import { Query } from "./query";
export function queryOrderBy(this: Query, field: string, direction = "asc") { return new Query(this.context, this.collectionPath, this.filters, [field,direction], this.max, this.after); }
