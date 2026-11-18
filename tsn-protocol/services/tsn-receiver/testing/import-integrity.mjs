import path from "node:path";

/** Resolve authored relative value imports and find cycles without importing components. */
export function importIntegrity(files) {
  const names = new Set(), graph = new Map(), missing = [];
  for (const file of files) names.add(file.path);
  for (const file of files) {
    const edges = [];
    for (const item of file.imports) {
      if (!item.source.startsWith(".")) continue;
      const base = path.posix.normalize(path.posix.join(path.posix.dirname(file.path), item.source.replace(/\.(?:js|mjs|ts)$/, "")));
      let target;
      for (const name of [`${base}.ts`, `${base}.tsx`, `${base}.mjs`]) if (names.has(name)) { target = name; break; }
      if (!target) { missing.push({ source: file.path, imported: item.source }); continue; }
      if (!item.typeOnly && !item.bindings?.startsWith("{ type ")) edges.push(target);
    }
    graph.set(file.path, edges);
  }
  const visited = new Set(), cycles = [];
  for (const start of graph.keys()) {
    if (visited.has(start)) continue;
    const stack = [{ name: start, index: 0 }], active = new Set([start]);
    while (stack.length) {
      const frame = stack[stack.length - 1], edges = graph.get(frame.name) ?? [];
      if (frame.index >= edges.length) { stack.pop(); active.delete(frame.name); visited.add(frame.name); continue; }
      const next = edges[frame.index++];
      if (active.has(next)) {
        const cycle = [];
        for (const item of stack) cycle.push(item.name);
        cycle.push(next); cycles.push(cycle); continue;
      }
      if (!visited.has(next)) { active.add(next); stack.push({ name: next, index: 0 }); }
    }
  }
  return { missing, cycles };
}
