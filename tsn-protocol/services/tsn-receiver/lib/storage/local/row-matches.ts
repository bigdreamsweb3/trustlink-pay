import type { Row } from "./types";
export function rowMatches(row: Row, filters: [string,string,unknown][]): boolean {
  for (const [field,operator,expected] of filters) {
    const actual = row[field]; const value = expected as any; let matches;
    if (operator === "==") matches = actual === value;
    else if (operator === "!=") matches = actual !== value;
    else if (operator === "<") matches = actual < value;
    else if (operator === "<=") matches = actual <= value;
    else if (operator === ">") matches = actual > value;
    else if (operator === ">=") matches = actual >= value;
    else throw new Error(`LOCAL_QUERY_OPERATOR_UNSUPPORTED: ${operator}`);
    if (!matches) return false;
  }
  return true;
}
