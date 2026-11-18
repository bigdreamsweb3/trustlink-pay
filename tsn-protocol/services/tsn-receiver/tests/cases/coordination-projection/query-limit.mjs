import assert from "node:assert/strict";

export function queryLimit(context, maximum) {
  assert.equal(maximum, 200);
  context.maximum = maximum;
  return context.collection;
}
