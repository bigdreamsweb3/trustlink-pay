import path from "node:path";
/** Lexical aliases remain filesystem-lock protected; normalize the ordinary Windows path/case aliases. */
export function lockQueueKey(file: string): string {
  const resolved = path.resolve(file);
  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}
