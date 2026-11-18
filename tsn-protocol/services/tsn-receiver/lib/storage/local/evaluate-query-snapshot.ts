import { rowMatches } from "./row-matches";
import { compareQueryRows } from "./compare-query-rows";
import { Ref } from "./ref";
import { Snap } from "./snap";
import { QuerySnap } from "./query-snap";
import type { Database, QueryState, Row } from "./types";
/** Shared ordinary/transaction evaluator; retain original comparisons, insertion order and cursor contract. */
export function evaluateQuerySnapshot(this: QueryState, data: Database): QuerySnap {
  let rows: [string,Row][] = [];
  for (const entry of Object.entries(data[this.collectionPath] ?? {})) if (rowMatches(entry[1], this.filters)) rows.push(entry);
  if (this.order) rows.sort(compareQueryRows.bind(null, this.order));
  const selected: [string,Row][] = [];
  for (const [id,row] of rows) {
    if (this.after && !(id > this.after)) continue;
    selected.push([id,row]);
  }
  if (this.max) rows = selected.slice(0, this.max); else rows = selected;
  const docs: Snap[] = [];
  for (const [id,row] of rows) docs.push(new Snap(id,row,new Ref(this.context,this.collectionPath,id)));
  return new QuerySnap(docs);
}
