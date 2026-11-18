/** Compatible fixture component; inputs are supplied by the enclosing test. */
import path from "node:path";
import { pathToFileURL } from "node:url";
export function loadReceiverFixtureModule(directory, name) { return import(pathToFileURL(path.join(directory, name+".mjs")).href); }
