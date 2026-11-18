import type { Snap } from "./snap";
export function snapGet(this: Snap, field: string) { return this.dataValue?.[field]; }
