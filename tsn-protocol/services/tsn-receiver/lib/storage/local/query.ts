import { queryWhere } from "./query-where";
import { queryOrderBy } from "./query-order-by";
import { queryLimit } from "./query-limit";
import { queryStartAfter } from "./query-start-after";
import { queryGet } from "./query-get";
import { evaluateQuerySnapshot } from "./evaluate-query-snapshot";
import type { StorageContext } from "./types";
export class Query {
  where = queryWhere; orderBy = queryOrderBy; limit = queryLimit; startAfter = queryStartAfter; get = queryGet; evaluateSnapshot = evaluateQuerySnapshot;
  constructor(public context: StorageContext, public collectionPath: string, public filters: [string,string,unknown][] = [], public order?: [string,string], public max?: number, public after?: string) {}
}
