"""Parse implementation declarations without importing servers or executing programs."""
from pathlib import Path
import ast
import json
import re

ROOT = Path(__file__).resolve().parents[3]
OUT = ROOT / "docs/laboratory"


def link(path, line=1):
    rel = path.relative_to(ROOT).as_posix()
    return f"[Source: {rel}, line {line}](../../{rel})"


def generate():
    server = ROOT / "tsn-protocol/services/tsn-node/server.py"
    text = server.read_text(encoding="utf-8-sig")
    module = ast.parse(text)
    endpoints = []
    schemas = []
    for node in module.body:
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            for deco in node.decorator_list:
                if isinstance(deco, ast.Call) and isinstance(deco.func, ast.Attribute) and isinstance(deco.func.value, ast.Name) and deco.func.value.id == "app" and deco.args and isinstance(deco.args[0], ast.Constant):
                    endpoints.append({"method": deco.func.attr.upper(), "path": deco.args[0].value, "function": node.name, "line": node.lineno,
                                      "signature": ast.unparse(node.args), "returns": ast.unparse(node.returns) if node.returns else "not annotated",
                                      "decoratorOptions": {kw.arg: ast.unparse(kw.value) for kw in deco.keywords}})
        if isinstance(node, ast.ClassDef) and any("BaseModel" in ast.unparse(base) for base in node.bases):
            schemas.append({"name": node.name, "line": node.lineno, "fields": [ast.unparse(item) for item in node.body if isinstance(item, ast.AnnAssign)]})
    receiver = []
    app = ROOT / "tsn-protocol/services/tsn-receiver/app"
    for path in sorted(app.rglob("route.ts")):
        route = "/" + path.parent.relative_to(app).as_posix()
        code = path.read_text(encoding="utf-8-sig")
        for match in re.finditer(r"export\s+(?:async\s+)?function\s+(GET|POST|PATCH|PUT|DELETE|OPTIONS)\b", code):
            receiver.append({"method": match.group(1), "path": route, "file": path.relative_to(ROOT).as_posix(), "line": code[:match.start()].count("\n") + 1,
                             "authReferences": sorted(set(re.findall(r"\b(?:require|assert|verify)[A-Za-z0-9]*(?:Auth|Key|Session|Attestation)[A-Za-z0-9]*", code)))})
    data = {"schemaVersion": 1, "scope": "Source declarations only; authentication also depends on handler bodies, middleware and configuration.", "nodeEndpoints": endpoints, "nodeSchemas": schemas, "receiverHandlers": receiver}
    (ROOT / "docs/references/http-interface-inventory.json").write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")
    lines = ["# HTTP interfaces and source schemas", "", "**Status: CURRENT source discovery; no HTTP server was started or endpoint exercised by this generator.** This reference lists routes actually declared in the Node and Receiver implementations. The decorator and authorization-symbol references help locate controls but are not a complete authentication analysis; read the handler, middleware and environment policy together.", "", "## Node routes", ""]
    for row in endpoints:
        lines += [f"### {row['method']} `{row['path']}`", "", f"Handler: `{row['function']}`. {link(server, row['line'])}.", "", "```python", f"{row['function']}({row['signature']}) -> {row['returns']}", "```", ""]
        if row["decoratorOptions"]:
            lines += ["Declared route options:", "", *[f"- `{key} = {value}`" for key, value in row["decoratorOptions"].items()], ""]
    lines += ["## Node request and response models", "", "These are declared Pydantic fields, including defaults where present. Runtime validation, aliases and handler-specific errors remain in the linked implementation.", ""]
    for row in schemas:
        lines += [f"### {row['name']}", "", link(server, row["line"]) + ".", "", "```python", *row["fields"], "```", ""]
    lines += ["## Receiver route handlers", "", "Paths below follow the Next.js filesystem router. Application aliases and proxies are configured separately; a Node endpoint is not automatically a Receiver endpoint.", ""]
    for row in receiver:
        lines += [f"### {row['method']} `{row['path']}`", "", link(ROOT / row["file"], row["line"]) + ".", ""]
        if row["authReferences"]:
            lines += ["Handler authorization references: " + ", ".join(f"`{s}`" for s in row["authReferences"]) + ".", ""]
    lines += ["## Request, error and retry interpretation", "", "Use the typed SDK contracts for intent construction. Native funding requires the canonical signed payment and exact owner-signed `tcap_funded_note_v1` deposit, with a restricted private opening bound to both wallet approvals. Receiver rejects externally created SETTLEMENT work. Worker APIs use their configured keys/session and lease controls; a public work-status response is a sanitized coordination view.", "", "`TsnHttpClient` throws a plain Error on non-2xx responses and has no automatic retry or timeout. Some Node endpoints return FastAPI `detail` errors, while Receiver routes return their own `error` fields and statuses. No generated OpenAPI availability or uniform rate limit is claimed here. Retry only after distinguishing accepted work from a lost response, and reconcile transaction signatures before reconstructing funding.", "", "See [component records](components.md), [invariants](invariants.md), and the [SDK troubleshooting guide](../../tsn-protocol/tsn-docs/sdk/troubleshooting.mdx).", ""]
    (OUT / "interface-reference.md").write_text("\n".join(lines), encoding="utf-8")

    rust_roots = {"TIP": "tsn-protocol/programs/transfer-identity-protocol/tin-registrar/program/src", "GPRU": "tsn-protocol/programs/gpru/src", "TSNP": "tsn-protocol/programs/tsn/protocol/programs/trustlink-escrow/src", "TCAP": "tsn-protocol/programs/tcap-protocol/programs/tcap/src"}
    lines = ["# Program declarations and account schema reference", "", "**Status: CURRENT source discovery.** This catalog extracts public instruction/function signatures and struct fields from Rust. It is not a generated IDL, byte-offset decoder or proof of deployed ABI compatibility. Account constraints, discriminators, PDA seeds and ordering must be read in the linked handler; the [credit ABI guide](credit-abi.md) explains the current nested call explicitly.", ""]
    counts = {}
    for component, directory in rust_roots.items():
        lines += [f"## {component}", ""]
        declarations = 0
        for path in sorted((ROOT / directory).rglob("*.rs")):
            code = path.read_text(encoding="utf-8-sig")
            items = []
            for match in re.finditer(r"\bpub\s+(?:async\s+)?fn\s+(\w+)\s*(?:<[^\n]*?>)?\s*\(", code):
                # Signatures end at the first body brace; declarations carry no bodies.
                end = code.find("{", match.end())
                if end < 0:
                    continue
                signature = re.sub(r"\s+", " ", code[match.start():end]).strip()
                if len(signature) > 5000:
                    continue
                items += [f"### `{match.group(1)}`", "", link(path, code[:match.start()].count("\n") + 1) + ".", "", "```rust", signature, "```", ""]
                declarations += 1
            for match in re.finditer(r"\bpub\s+struct\s+(\w+)[^{;]*\{", code):
                start = match.end(); depth = 1; end = start
                while end < len(code) and depth:
                    depth += (code[end] == "{") - (code[end] == "}")
                    end += 1
                body = code[start:end - 1]
                # Keep public field declarations, not handler implementation bodies.
                fields = []
                for field in re.finditer(r"\bpub\s+(\w+)\s*:\s*", body):
                    i = field.end(); brackets = 0; j = i
                    while j < len(body):
                        char = body[j]
                        if char in "<([": brackets += 1
                        elif char in ">)]": brackets -= 1
                        elif char == "," and brackets == 0: break
                        j += 1
                    fields.append(field.group(1) + ": " + re.sub(r"\s+", " ", body[i:j]).strip())
                if fields:
                    items += [f"### `{match.group(1)}` fields", "", link(path, code[:match.start()].count("\n") + 1) + ".", "", "```rust", *fields, "```", ""]
                    declarations += 1
            if items:
                lines += items
        counts[component] = declarations
    (OUT / "onchain-reference.md").write_text("\n".join(lines), encoding="utf-8")
    print(json.dumps({"nodeEndpoints": len(endpoints), "nodeSchemas": len(schemas), "receiverHandlers": len(receiver), "rustDeclarations": counts}))


if __name__ == "__main__":
    generate()
