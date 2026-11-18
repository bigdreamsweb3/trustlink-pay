import path from "node:path";
import { pathToFileURL } from "node:url";

export function loadComponent(captures, n) {
    return import(pathToFileURL(path.join(captures.verifyEpochsPaginateDeferAndSerializeAcrossConcurrentNodesContext.directory, n + ".mjs")).href);
}
