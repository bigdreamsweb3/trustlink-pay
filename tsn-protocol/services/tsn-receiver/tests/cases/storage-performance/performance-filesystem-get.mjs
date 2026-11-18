import { performanceReadFile } from "./performance-read-file.mjs";
export function performanceFilesystemGet(state, target, property) {
  if (property === "readFile") return performanceReadFile.bind(null, state);
  return Reflect.get(target, property);
}
