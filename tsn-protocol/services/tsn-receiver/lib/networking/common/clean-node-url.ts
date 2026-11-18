/** Preserve quote trimming and one trailing slash removal for configured Node URLs. */
export function cleanNodeUrl(value: string): string { return value.trim().replace(/^['"]|['"]$/g, "").replace(/\/$/, ""); }
