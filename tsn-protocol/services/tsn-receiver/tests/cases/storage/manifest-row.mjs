import { readFile } from "node:fs/promises";
import path from "node:path";
export async function manifestRow(fixture,collection,id) { const manifest=JSON.parse(await readFile(fixture.file,"utf8"));const relative=manifest.collections[collection][id];return {manifest,relative,row:JSON.parse(await readFile(path.join(fixture.file+".d",...relative.split("/")),"utf8"))}; }
