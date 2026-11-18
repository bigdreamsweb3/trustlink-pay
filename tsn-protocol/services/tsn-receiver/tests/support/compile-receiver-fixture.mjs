import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { rewriteReceiverImport } from "./rewrite-receiver-import.mjs";
import { receiverFixtureDestination } from "./receiver-fixture-destination.mjs";

/** Compile only a requested source graph; callers retain their explicit stub files. */
export async function compileReceiverFixture(moduleDirectory, sourceNames, options = {}) {
  const root = path.resolve(fileURLToPath(new URL("../../", import.meta.url)));
  const pending = [];
  for (const name of sourceNames) pending.push(path.join("lib", name));
  const destinations = new Map();
  for (const route of options.routes ?? []) {
    pending.push(route.path);
    destinations.set(path.resolve(root, route.path), path.join(moduleDirectory, `${route.output}.mjs`));
  }
  const compiled = new Set();
  while (pending.length) {
    const name = pending.shift();
    const sourcePath = path.resolve(root, name);
    if (!sourcePath.startsWith(`${root}${path.sep}`)) throw new Error("FIXTURE_SOURCE_OUTSIDE_RECEIVER");
    if (compiled.has(sourcePath)) continue;
    compiled.add(sourcePath);
    const source = await readFile(sourcePath, "utf8");
    const output = ts.transpileModule(source, {
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
    }).outputText.replace(
      /((?:from\s*|import\s*\(\s*))(["'])([^"']+)\2/g,
      rewriteReceiverImport.bind(null, { root, source: sourcePath, pending, moduleDirectory, destinations }),
    );
    const destination = receiverFixtureDestination({ root, moduleDirectory, destinations }, sourcePath);
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, output);
  }
}
