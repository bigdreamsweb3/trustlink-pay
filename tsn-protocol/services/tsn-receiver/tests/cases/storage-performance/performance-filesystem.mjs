import { promises as native } from "node:fs";
import { performanceFilesystemGet } from "./performance-filesystem-get.mjs";
export function performanceFilesystem(state) {
  return new Proxy(native, { get: performanceFilesystemGet.bind(null, state) });
}
