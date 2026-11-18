import type { Snap } from "./snap";
export function snapExists(this: Snap) { return !!this.dataValue; }
