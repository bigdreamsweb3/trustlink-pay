import fs from "node:fs";
import path from "node:path";

/** Enumerate authored runtime/test source; exclude installed, generated and operator files. */
export function sourceFiles(root) {
  const pending = ["app", "lib", "tests", "testing"], result = [];
  while (pending.length) {
    const relative = pending.pop(), absolute = path.join(root, relative);
    for (const entry of fs.readdirSync(absolute, { withFileTypes: true })) {
      const child = path.join(relative, entry.name);
      if (entry.isDirectory()) pending.push(child);
      else if (/\.(?:tsx?|mjs)$/.test(entry.name)) result.push(child.replaceAll("\\", "/"));
    }
  }
  return result.sort();
}
