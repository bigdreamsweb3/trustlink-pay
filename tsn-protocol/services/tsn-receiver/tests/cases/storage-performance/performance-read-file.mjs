import { promises as native } from "node:fs";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
export async function performanceReadFile(state, file, ...args) {
  const location = path.resolve(String(file));
  if (!location.startsWith(state.file + ".d" + path.sep) || (!location.includes(path.sep + "epochs" + path.sep) && !location.includes(path.sep + "metadata" + path.sep))) {
    return native.readFile(file, ...args);
  }
  state.active += 1;
  state.peak = Math.max(state.peak, state.active);
  state.recordReads += 1;
  state.recordPaths.push(location);
  try {
    await delay(state.delays.get(location) ?? 2);
    try { await native.access(state.file + ".lock"); }
    catch { state.readsAfterUnlock += 1; }
    if (state.failures.has(location)) throw new Error(state.failures.get(location));
    return await native.readFile(file, ...args);
  } finally { state.active -= 1; }
}
