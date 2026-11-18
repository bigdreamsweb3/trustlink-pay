import assert from "node:assert/strict";
import { queryOrder } from "./query-order.mjs";
import { queryWhere } from "./query-where.mjs";
import { queryLimit } from "./query-limit.mjs";
import { queryPage } from "./query-page.mjs";

/** A query-only persistence port makes a repeated document lookup fail immediately. */
export function createQueryFixture(rows) {
  const context = { rows, after: "", maximum: 200, reads: 0, orders: 0, filters: 0 };
  context.collection = {
    orderBy: queryOrder.bind(null, context),
    where: queryWhere.bind(null, context),
    limit: queryLimit.bind(null, context),
    get: queryPage.bind(null, context),
    doc: assert.fail.bind(null, "coordination must project its page instead of rereading documents"),
  };
  return context;
}
