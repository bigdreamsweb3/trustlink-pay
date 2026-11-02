// Documentation-only extraction. TypeScript parses source; no SDK module executes.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "../../../tsn-protocol/sdks/tsn-sdk/node_modules/typescript/lib/typescript.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const sdk = path.join(root, "tsn-protocol/sdks/tsn-sdk");
const site = path.join(root, "tsn-protocol/tsn-docs");
const config = ts.readConfigFile(path.join(sdk, "tsconfig.json"), ts.sys.readFile);
const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, sdk);
const program = ts.createProgram(parsed.fileNames, { ...parsed.options, noEmit: true });
const checker = program.getTypeChecker();
const pkg = JSON.parse(fs.readFileSync(path.join(sdk, "package.json"), "utf8"));
const flags = ts.TypeFormatFlags.NoTruncation | ts.TypeFormatFlags.UseAliasDefinedOutsideCurrentScope;
const clean = (s) => s.replaceAll(root.replaceAll("\\", "/") + "/", "").replaceAll(root + path.sep, "");
const mdxDocs = (s) => s.replace(/\{@(?:link|linkcode|linkplain)\s+([^}]+)\}/g, (_, target) => "`" + target.trim().replaceAll("`", "") + "`");
const typeText = (type, node) => clean(checker.typeToString(type, node, flags));
const sourceLink = (node) => {
  const source = node.getSourceFile();
  const rel = path.relative(root, source.fileName).replaceAll("\\", "/");
  const line = source.getLineAndCharacterOfPosition(node.getStart()).line + 1;
  return { path: rel, line, url: `https://github.com/bigdreamsweb3/trustlink-pay/blob/main/${rel}#L${line}` };
};
const publicImports = new Map();
for (const [subpath, value] of Object.entries(pkg.exports)) {
  const sources = subpath.includes("*")
    ? parsed.fileNames.filter((p) => p.replaceAll("\\", "/").includes("/src/blockchain/"))
    : [path.join(sdk, value.types.replace(/^\.\/dist\//, "src/").replace(/\.d\.ts$/, ".ts"))];
  for (const filename of sources) {
    const source = program.getSourceFile(filename);
    const module = source && checker.getSymbolAtLocation(source);
    if (!module) continue;
    const importPath = subpath === "." ? pkg.name : pkg.name + subpath.slice(1).replace("*", path.basename(filename, ".ts"));
    for (let symbol of checker.getExportsOfModule(module)) {
      if (symbol.flags & ts.SymbolFlags.Alias) symbol = checker.getAliasedSymbol(symbol);
      const key = symbol.declarations?.[0];
      if (!key) continue;
      const existing = publicImports.get(key) ?? { symbol, imports: new Set() };
      existing.imports.add(importPath);
      publicImports.set(key, existing);
    }
  }
}
const groups = new Map();
for (const [declaration, entry] of publicImports) {
  const file = declaration.getSourceFile().fileName;
  if (file.includes("node_modules")) continue;
  const rel = path.relative(root, file).replaceAll("\\", "/");
  const moduleName = rel.includes("/src/") ? rel.split("/src/").at(-1).replace(/\.ts$/, "") : path.basename(file, ".ts");
  const slug = moduleName.replaceAll("/", "-");
  const rows = groups.get(slug) ?? { slug, name: moduleName, path: rel, symbols: [] };
  const type = checker.getTypeOfSymbolAtLocation(entry.symbol, declaration);
  const docs = ts.displayPartsToString(entry.symbol.getDocumentationComment(checker));
  const signatures = checker.getSignaturesOfType(type, ts.SignatureKind.Call).map((s) => clean(checker.signatureToString(s, declaration, flags)));
  const constructors = checker.getSignaturesOfType(type, ts.SignatureKind.Construct).map((s) => clean(checker.signatureToString(s, declaration, flags)));
  const methods = [];
  if (ts.isClassDeclaration(declaration) || ts.isInterfaceDeclaration(declaration)) {
    const instance = checker.getDeclaredTypeOfSymbol(entry.symbol);
    const surfaces = [["instance", instance]];
    if (ts.isClassDeclaration(declaration)) surfaces.push(["static", type]);
    for (const [memberKind, surface] of surfaces) for (const member of checker.getPropertiesOfType(surface)) {
      const decl = member.declarations?.[0];
      if (!decl || decl.getSourceFile().fileName.includes("node_modules") || ts.getCombinedModifierFlags(decl) & (ts.ModifierFlags.Private | ts.ModifierFlags.Protected) || member.name.startsWith("#")) continue;
      const memberType = checker.getTypeOfSymbolAtLocation(member, decl);
      const calls = checker.getSignaturesOfType(memberType, ts.SignatureKind.Call);
      methods.push({ name: member.name, memberKind, signatures: calls.map((s) => clean(checker.signatureToString(s, decl, flags))),
        type: calls.length ? null : typeText(memberType, decl), docs: ts.displayPartsToString(member.getDocumentationComment(checker)), source: sourceLink(decl) });
    }
  }
  const errors = [];
  const calls = new Set();
  function inspect(node) {
    if (ts.isThrowStatement(node)) errors.push(clean(node.expression.getText()).replace(/\s+/g, " "));
    if (ts.isCallExpression(node)) calls.add(node.expression.getText());
    ts.forEachChild(node, inspect);
  }
  inspect(declaration);
  let declaredType = null;
  if (ts.isTypeAliasDeclaration(declaration)) declaredType = clean(declaration.getText());
  else if (!signatures.length && !constructors.length && !methods.length) declaredType = typeText(type, declaration);
  rows.symbols.push({ name: entry.symbol.name, imports: [...entry.imports], docs, signatures, constructors, methods, declaredType,
    directThrowExpressions: [...new Set(errors)], directCalls: [...calls], source: sourceLink(declaration) });
  groups.set(slug, rows);
}
const output = path.join(site, "api-reference/sdk/modules");
fs.mkdirSync(output, { recursive: true });
const sorted = [...groups.values()].sort((a, b) => a.name.localeCompare(b.name));
for (const group of sorted) {
  const lines = ["---", `title: ${JSON.stringify(group.name + " API")}`, `description: ${JSON.stringify("Source-derived exports, parameter and result types, public methods and source links.")}`, "---", "",
    "This reference is generated from the checked-out TypeScript exports. Types and signatures describe the package contract; source presence does not establish deployment or service availability. Error expressions below are direct throws, not an exhaustive list of failures from dependencies.", "",
    `[Source module](https://github.com/bigdreamsweb3/trustlink-pay/blob/main/${group.path}). See the [reference index](/sdk/api-reference) for package import boundaries and verification scope.`, ""];
  for (const item of group.symbols.sort((a, b) => a.name.localeCompare(b.name))) {
    lines.push(`## ${item.name}`, "");
    if (item.docs) lines.push(mdxDocs(item.docs), "");
    lines.push(`Import from ${item.imports.map((p) => "`" + p + "`").join(" or ")}. [Implementation, line ${item.source.line}](${item.source.url}).`, "");
    for (const sig of item.signatures) lines.push("```ts", item.name + sig, "```", "");
    for (const sig of item.constructors) lines.push("```ts", "new " + item.name + sig, "```", "");
    if (item.declaredType) lines.push("```ts", item.declaredType, "```", "");
    for (const member of item.methods) {
      lines.push(`### ${item.name}.${member.name}${member.memberKind === "static" ? " (static)" : ""}`, "");
      if (member.docs) lines.push(mdxDocs(member.docs), "");
      lines.push(`[Source, line ${member.source.line}](${member.source.url}).`, "", "```ts");
      lines.push(...(member.signatures.length ? member.signatures.map((s) => member.name + s) : [member.name + ": " + member.type]), "```", "");
    }
    if (item.directThrowExpressions.length) lines.push("Direct failure expressions:", "", "```text", ...item.directThrowExpressions, "```", "");
  }
  fs.writeFileSync(path.join(output, group.slug + ".mdx"), lines.join("\n"));
}
const metadata = { schemaVersion: 1, packageName: pkg.name, packageVersion: pkg.version, scope: "Root and package.json subpath exports. Source extraction only; excluded dependency internals. Direct throw expressions are not exhaustive.",
  modules: sorted, counts: { modules: sorted.length, exports: sorted.reduce((n, g) => n + g.symbols.length, 0), publicMembers: sorted.reduce((n, g) => n + g.symbols.reduce((m, s) => m + s.methods.length, 0), 0) } };
fs.writeFileSync(path.join(root, "docs/references/sdk-api-inventory.json"), JSON.stringify(metadata, null, 2) + "\n");
const index = ["---", 'title: "Complete SDK API reference"', 'description: "Source-derived public exports and class methods, organized by module."', "---", "",
  "The generated reference covers public root exports and the explicit `package.json` subpaths, including server-only modules. An exported method may still require a configured service, deployed program, or experimental provider. Browser bundles must use only browser-safe modules; the root entry exports server facilities as well.", "",
  `The checked-out package is \`${pkg.name}@${pkg.version}\`. The catalog contains **${metadata.counts.modules} modules, ${metadata.counts.exports} exported symbols and ${metadata.counts.publicMembers} public class/interface members**. Parameters and return types are extracted with TypeScript; direct errors and source links accompany each export.`, "",
  "## Modules", "", ...sorted.map((g) => `- [${g.name}](/api-reference/sdk/modules/${g.slug}) — ${g.symbols.length} exports.`), "",
  "## Maintenance and limits", "", "Regenerate from the workspace root with `node docs/references/tooling/generate-sdk-reference.mjs`. The package's installed TypeScript compiler is required. The output is documentation metadata, not another SDK implementation. Source links point to the existing workspace remote and its main branch; local uncommitted changes may not yet be visible remotely. The internal inventory records the local files and line numbers used.", "",
  "Signatures are verified against checked-out source. The reference does not imply that every exported integration is exercised end to end. See [SDK troubleshooting](/sdk/troubleshooting) for runtime and confirmation boundaries.", ""];
fs.writeFileSync(path.join(site, "sdk/api-reference.mdx"), index.join("\n"));
console.log(JSON.stringify(metadata.counts));
