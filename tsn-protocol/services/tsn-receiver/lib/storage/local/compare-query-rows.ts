import type { Row } from "./types";
export function compareQueryRows(order: [string,string], left: [string,Row], right: [string,Row]): number {
  const [field,direction] = order;
  const a = String(field === "__name__" ? left[0] : left[1][field] ?? "");
  const b = String(field === "__name__" ? right[0] : right[1][field] ?? "");
  return (a < b ? -1 : a > b ? 1 : 0) * (direction === "desc" ? -1 : 1);
}
