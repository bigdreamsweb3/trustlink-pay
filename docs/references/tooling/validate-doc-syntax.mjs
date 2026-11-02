// Pass a temporary dependency prefix containing @mdx-js/mdx and mermaid.
// This validator compiles/parses files only; it never starts a documentation site.
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const dependencyPrefix = process.argv[2];
if (!dependencyPrefix) throw new Error("Pass a temporary dependency prefix for documentation parser packages");
const parserRequire = createRequire(path.join(path.resolve(dependencyPrefix), "package.json"));
// Mermaid imports DOMPurify eagerly; provide a real DOM before loading it.
const { JSDOM } = parserRequire("jsdom");
const dom = new JSDOM("<!doctype html><html><body></body></html>");
globalThis.window = dom.window;
globalThis.document = dom.window.document;
const { compile } = await import(pathToFileURL(parserRequire.resolve("@mdx-js/mdx")).href);
const { default: mermaid } = await import(pathToFileURL(parserRequire.resolve("mermaid")).href);
mermaid.initialize({ startOnLoad: false, securityLevel: "strict" });
let mdxCount = 0;
let diagramCount = 0;
const failures = [];
function* files(directory) {
  for (const item of fs.readdirSync(directory, { withFileTypes: true })) {
    const filename = path.join(directory, item.name);
    if (item.isDirectory()) yield* files(filename);
    else if (/\.mdx?$/.test(item.name)) yield filename;
  }
}
const entryFiles = ["AGENTS.md", "README.md", "tsn-protocol/README.md"].map(file => path.join(root, file));
for (const filename of [...files(path.join(root, "docs")), ...files(path.join(root, "tsn-protocol/tsn-docs")), ...files(path.join(root, ".codex")), ...entryFiles]) {
  const text = fs.readFileSync(filename, "utf8");
  const file = path.relative(root, filename).replaceAll("\\", "/");
  if (filename.endsWith(".mdx")) {
    try {
      await compile(text.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, ""));
      mdxCount++;
    } catch (error) {
      failures.push({ file, kind: "MDX", error: String(error) });
    }
  }
  for (const match of text.matchAll(/```mermaid\s*\r?\n([\s\S]*?)```/g)) {
    const line = text.slice(0, match.index).split("\n").length;
    try { await mermaid.parse(match[1]); diagramCount++; }
    catch (error) { failures.push({ file, line, kind: "Mermaid", error: String(error) }); }
  }
}
const report = { scope: "Both documentation trees, .codex Markdown and AGENTS/root/protocol README entries: MDX compilation and Mermaid syntax parsing; does not test Mintlify theme/browser rendering, external links or live endpoints.", mdxCompiled: mdxCount, diagramsParsed: diagramCount, failures };
dom.window.close();
fs.writeFileSync(path.join(root, "docs/references/syntax-check.json"), JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify({ mdxCompiled: mdxCount, diagramsParsed: diagramCount, failures: failures.length }));
if (failures.length) process.exitCode = 1;
