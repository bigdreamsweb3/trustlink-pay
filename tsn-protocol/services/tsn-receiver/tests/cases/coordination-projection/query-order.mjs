import assert from "node:assert/strict";

export function queryOrder(context, field, direction) {
  assert.equal(field, "id");
  assert.equal(direction, undefined);
  context.orders += 1;
  return context.collection;
}
