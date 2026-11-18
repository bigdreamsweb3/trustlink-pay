import type { Snap } from "./snap";
export function snapData(this: Snap) { return this.dataValue ?? undefined; }
