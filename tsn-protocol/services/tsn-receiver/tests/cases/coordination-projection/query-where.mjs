import assert from "node:assert/strict";

export function queryWhere(context, field, operator, value) {
  assert.equal(field, "id");
  assert.equal(operator, ">");
  context.after = value;
  context.filters += 1;
  return context.collection;
}
