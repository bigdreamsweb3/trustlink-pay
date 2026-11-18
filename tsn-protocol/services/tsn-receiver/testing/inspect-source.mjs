import fs from "node:fs";
import ts from "typescript";
import { appendNode } from "./append-node.mjs";

/** Record AST component contracts without evaluating runtime modules or private state. */
export function inspectSource(root, relative) {
  const absolute = `${root}/${relative}`, source = ts.createSourceFile(relative, fs.readFileSync(absolute, "utf8"), ts.ScriptTarget.Latest, true);
  const functions = [], imports = [], forbidden = [], bindings = [];
  const printer = ts.createPrinter();
  const pending = [source];
  while (pending.length) {
    const node = pending.pop();
    if ((ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node) || ts.isArrowFunction(node)
      || ts.isMethodDeclaration(node) || ts.isConstructorDeclaration(node) || ts.isGetAccessorDeclaration(node) || ts.isSetAccessorDeclaration(node)) && node.body) {
      const name = node.name?.getText(source) ?? (ts.isVariableDeclaration(node.parent) ? node.parent.name.getText(source) : ts.isConstructorDeclaration(node) ? "constructor" : "callback");
      let dependencies;
      const inputs = [];
      for (const parameter of node.parameters) {
        inputs.push(parameter.getText(source));
        if (/^(?:dependencies|context|ports)$/.test(parameter.name.getText(source))) dependencies = parameter;
      }
      functions.push({ name, line: source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1,
        inputs,
        output: node.type?.getText(source) ?? "inferred; see implementation and family contract",
        dependencyDeclaration: dependencies?.type?.getText(source) ?? null,
        bodyHashInput: printer.printNode(ts.EmitHint.Unspecified, node.body, source) });
    }
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
      if (node.moduleSpecifier) imports.push({ source: node.moduleSpecifier.text,
        typeOnly: Boolean(node.isTypeOnly || node.importClause?.isTypeOnly),
        bindings: node.importClause?.namedBindings?.getText(source) ?? node.exportClause?.getText(source) ?? null });
      if ((ts.isImportDeclaration(node) && node.importClause?.namedBindings && ts.isNamespaceImport(node.importClause.namedBindings))
        || (ts.isExportDeclaration(node) && node.moduleSpecifier && !node.exportClause)) forbidden.push("wildcard namespace");
    }
    if (ts.isNewExpression(node) && node.expression.getText(source) === "Function") forbidden.push("dynamic Function");
    if (ts.isCallExpression(node) && node.expression.getText(source) === "eval") forbidden.push("eval");
    if (ts.isPropertyDeclaration(node) && node.initializer) bindings.push({ name: node.name.getText(source), implementation: node.initializer.getText(source) });
    ts.forEachChild(node, appendNode.bind(null, pending));
  }
  const errors = [];
  const errorPending = [source];
  while (errorPending.length) {
    const node = errorPending.pop();
    if (ts.isNewExpression(node) && node.expression.getText(source) === "Error" && node.arguments?.[0] && ts.isStringLiteral(node.arguments[0])) errors.push(node.arguments[0].text);
    ts.forEachChild(node, appendNode.bind(null, errorPending));
  }
  const syntaxErrors = [];
  for (const item of source.parseDiagnostics) syntaxErrors.push(ts.flattenDiagnosticMessageText(item.messageText, " "));
  return { path: relative, functions, imports, classBindings: bindings, literalErrors: [...new Set(errors)].sort(), forbidden, syntaxErrors };
}
