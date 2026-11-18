"""Parse implementation declarations without importing servers or executing programs."""
from pathlib import Path
import ast
import argparse
import copy
from functools import lru_cache
import json
import re

ROOT = Path(__file__).resolve().parents[3]
OUT = ROOT / "docs/laboratory"
NODE_ROOT = ROOT / "tsn-protocol/services/tsn-node"
RECEIVER_ROOT = ROOT / "tsn-protocol/services/tsn-receiver"
HTTP_METHODS = {"GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS", "HEAD"}
CONTROL_NAME = r"(?:requireService|authenticateCrankerRequest|enforceCrankerLeaseRateLimit|assertAuthorizedFundingIngress|assertExternalWorkKind|(?:require|assert|verify)[A-Za-z0-9_]*(?:Auth|Key|Session|Attestation)[A-Za-z0-9_]*)"


def link(path, line=1):
    rel = path.relative_to(ROOT).as_posix()
    return f"[Source: {rel}, line {line}](../../{rel})"


@lru_cache(maxsize=None)
def python_module(path):
    return ast.parse(path.read_text(encoding="utf-8-sig"), filename=str(path))


def local_python_module(path, module, level=0):
    if level:
        parent = path.parent
        for _ in range(level - 1):
            parent = parent.parent
        target = parent.joinpath(*(module or "").split("."))
    else:
        target = NODE_ROOT.joinpath(*(module or "").split("."))
    for candidate in (target.with_suffix(".py"), target / "__init__.py"):
        if candidate.is_file() and NODE_ROOT.resolve() in candidate.resolve().parents:
            return candidate.resolve()
    return None


def resolve_python_expression(path, expression, seen):
    if isinstance(expression, ast.Name):
        return resolve_python_symbol(path, expression.id, seen)
    if isinstance(expression, ast.Call) and isinstance(expression.func, ast.Name):
        if expression.func.id in {"staticmethod", "classmethod", "partial"} and expression.args:
            return resolve_python_expression(path, expression.args[0], seen)
        return resolve_python_symbol(path, expression.func.id, seen)
    if isinstance(expression, ast.Attribute) and isinstance(expression.value, ast.Name):
        owner = resolve_python_symbol(path, expression.value.id, seen)
        if owner and isinstance(owner[1], ast.ClassDef):
            owner_path, definition, _ = owner
            for item in definition.body:
                if isinstance(item, ast.Assign) and any(isinstance(target, ast.Name) and target.id == expression.attr for target in item.targets):
                    result = resolve_python_expression(owner_path, item.value, seen)
                    if result:
                        static = isinstance(item.value, ast.Call) and isinstance(item.value.func, ast.Name) and item.value.func.id == "staticmethod"
                        return result[0], result[1], not static
    return None


def resolve_python_symbol(path, name, seen=None):
    path = path.resolve()
    visited = set(seen or ())
    identity = (path, name)
    if identity in visited:
        return None
    visited.add(identity)
    module = python_module(path)
    for item in module.body:
        if isinstance(item, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)) and item.name == name:
            return path, item, False
    for item in module.body:
        if isinstance(item, ast.ImportFrom):
            for alias in item.names:
                if (alias.asname or alias.name) == name:
                    target = local_python_module(path, item.module, item.level)
                    if target:
                        return resolve_python_symbol(target, alias.name, visited)
    for item in module.body:
        if isinstance(item, ast.Assign) and any(isinstance(target, ast.Name) and target.id == name for target in item.targets):
            return resolve_python_expression(path, item.value, visited)
    return None


def route_declaration(call):
    if not isinstance(call, ast.Call) or not isinstance(call.func, ast.Attribute):
        return False
    return (isinstance(call.func.value, ast.Name) and call.func.value.id == "app"
            and call.func.attr.upper() in HTTP_METHODS and bool(call.args)
            and isinstance(call.args[0], ast.Constant) and isinstance(call.args[0].value, str))


def node_endpoint(server, declaration, expression, definition=None):
    resolved = (server, definition, False) if definition else resolve_python_expression(server, expression, set())
    if not resolved or not isinstance(resolved[1], (ast.FunctionDef, ast.AsyncFunctionDef)):
        raise ValueError(f"Unresolved Node HTTP handler: {ast.unparse(expression)}")
    source, handler, bound = resolved
    arguments = copy.deepcopy(handler.args)
    if bound:
        if arguments.posonlyargs:
            arguments.posonlyargs.pop(0)
        elif arguments.args:
            arguments.args.pop(0)
    return {"method": declaration.func.attr.upper(), "path": declaration.args[0].value,
            "function": handler.name, "file": source.relative_to(ROOT).as_posix(), "line": handler.lineno,
            "signature": ast.unparse(arguments), "implementationSignature": ast.unparse(handler.args),
            "returns": ast.unparse(handler.returns) if handler.returns else "not annotated",
            "binding": ast.unparse(expression), "boundRuntimePort": bound,
            "registrationFile": server.relative_to(ROOT).as_posix(), "registrationLine": declaration.lineno,
            "decoratorOptions": {kw.arg: ast.unparse(kw.value) for kw in declaration.keywords}}


def discover_node_endpoints(server):
    endpoints = []
    for item in python_module(server).body:
        if isinstance(item, (ast.FunctionDef, ast.AsyncFunctionDef)):
            for decorator in item.decorator_list:
                if route_declaration(decorator):
                    endpoints.append(node_endpoint(server, decorator, ast.Name(id=item.name), item))
        elif isinstance(item, ast.Expr) and isinstance(item.value, ast.Call) and route_declaration(item.value.func):
            if len(item.value.args) != 1:
                raise ValueError("Unsupported Node HTTP registration arguments")
            endpoints.append(node_endpoint(server, item.value.func, item.value.args[0]))
    return endpoints


def model_details(path, definition, seen=None):
    visited = set(seen or ())
    identity = (path, definition.name)
    if identity in visited:
        raise ValueError(f"Cyclic Pydantic model inheritance: {definition.name}")
    visited.add(identity)
    fields, bases, configuration = {}, [], None
    is_model = False
    for base in definition.bases:
        if isinstance(base, ast.Name) and base.id == "BaseModel":
            is_model = True
            continue
        resolved = resolve_python_expression(path, base, set())
        if resolved and isinstance(resolved[1], ast.ClassDef):
            parent = model_details(resolved[0], resolved[1], visited)
            if parent:
                is_model = True
                bases.append({"name": resolved[1].name, "file": resolved[0].relative_to(ROOT).as_posix(), "line": resolved[1].lineno})
                fields.update({field["name"]: field for field in parent["fieldSources"]})
                if parent["modelConfig"]:
                    configuration = parent["modelConfig"]
    if not is_model:
        return None
    for item in definition.body:
        if isinstance(item, ast.AnnAssign) and isinstance(item.target, ast.Name):
            fields[item.target.id] = {"name": item.target.id, "declaration": ast.unparse(item),
                                    "file": path.relative_to(ROOT).as_posix(), "line": item.lineno, "declaredIn": definition.name}
        elif isinstance(item, ast.Assign) and any(isinstance(target, ast.Name) and target.id == "model_config" for target in item.targets):
            configuration = ast.unparse(item)
    return {"name": definition.name, "file": path.relative_to(ROOT).as_posix(), "line": definition.lineno,
            "fields": [field["declaration"] for field in fields.values()], "fieldSources": list(fields.values()),
            "bases": bases, "modelConfig": configuration}


def discover_node_schemas(server):
    schemas, seen = [], set()
    paths = [server, *sorted((NODE_ROOT / "core/schemas").glob("*.py"))]
    for path in paths:
        for definition in python_module(path).body:
            if isinstance(definition, ast.ClassDef):
                details = model_details(path, definition)
                if details and definition.name not in seen:
                    schemas.append(details)
                    seen.add(definition.name)
    return schemas


@lru_cache(maxsize=None)
def typescript_source(path):
    return path.read_text(encoding="utf-8-sig")


def local_typescript_module(path, module):
    if not module.startswith("."):
        return None
    target = (path.parent / module).resolve()
    for candidate in (target.with_suffix(".ts"), target / "index.ts"):
        if candidate.is_file() and RECEIVER_ROOT.resolve() in candidate.resolve().parents:
            return candidate
    return None


def typescript_imports(path):
    imports = {}
    for match in re.finditer(r"\b(?:import|export)\s+(?:type\s+)?\{([^}]+)\}\s+from\s+['\"]([^'\"]+)['\"]", typescript_source(path)):
        target = local_typescript_module(path, match.group(2))
        if target:
            for specifier in match.group(1).split(","):
                names = re.split(r"\s+as\s+", specifier.strip())
                imports[names[-1]] = (target, names[0])
    return imports


def resolve_typescript_symbol(path, name, seen=None):
    visited = set(seen or ())
    identity = (path, name)
    if identity in visited:
        return None
    visited.add(identity)
    code = typescript_source(path)
    definition = re.search(rf"\b(?:export\s+)?(?:async\s+)?function\s+{re.escape(name)}\s*\(", code)
    if definition:
        return {"file": path.relative_to(ROOT).as_posix(), "line": code[:definition.start()].count("\n") + 1, "function": name}
    imports = typescript_imports(path)
    if name in imports:
        target, imported = imports[name]
        return resolve_typescript_symbol(target, imported, visited)
    assignment = re.search(rf"\b(?:export\s+)?const\s+{re.escape(name)}(?:\s*:\s*[^=;]+)?\s*=\s*([^;]+);", code)
    if assignment:
        value = assignment.group(1).strip()
        bound = re.match(r"([A-Za-z_$][\w$]*)\.bind\s*\(", value)
        alias = re.fullmatch(r"[A-Za-z_$][\w$]*", value)
        if bound or alias:
            return resolve_typescript_symbol(path, bound.group(1) if bound else value, visited)
    return None


def typescript_function_body(code, name):
    # Mask comments/literals before finding the declared function's balanced body.
    # This avoids assigning another method's controls to a historical multi-handler file.
    literals = r"//[^\n]*|/\*[\s\S]*?\*/|\"(?:\\.|[^\"\\])*\"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`"
    masked = re.sub(literals, lambda match: re.sub(r"[^\n]", " ", match.group(0)), code)
    match = re.search(rf"\b(?:export\s+)?(?:async\s+)?function\s+{re.escape(name)}\s*\(", masked)
    if not match:
        raise ValueError(f"Cannot locate resolved Receiver function body: {name}")
    cursor, depth = match.end(), 1
    while cursor < len(masked) and depth:
        depth += (masked[cursor] == "(") - (masked[cursor] == ")")
        cursor += 1
    start = masked.find("{", cursor)
    if start < 0:
        raise ValueError(f"Missing Receiver function body: {name}")
    cursor, depth = start + 1, 1
    while cursor < len(masked) and depth:
        depth += (masked[cursor] == "{") - (masked[cursor] == "}")
        cursor += 1
    if depth:
        raise ValueError(f"Unbalanced Receiver function body: {name}")
    return masked[start:cursor]


def discover_receiver_handlers():
    receiver = []
    app = RECEIVER_ROOT / "app"
    for path in sorted(app.rglob("route.ts")):
        route = "/" + path.parent.relative_to(app).as_posix()
        code = typescript_source(path)
        methods = list(re.finditer(r"\bexport\s+(?:(?:async\s+)?function\s+|const\s+)(GET|POST|PATCH|PUT|DELETE|OPTIONS|HEAD)\b", code))
        for match in methods:
            implementation = resolve_typescript_symbol(path, match.group(1))
            if not implementation:
                raise ValueError(f"Unresolved Receiver handler: {path} {match.group(1)}")
            implementation_path = ROOT / implementation["file"]
            body = typescript_function_body(typescript_source(implementation_path), implementation["function"])
            controls = sorted(set(re.findall(rf"\b({CONTROL_NAME})\s*\(", body)))
            control_sources = []
            runtime = typescript_imports(path).get("dependencies")
            for control in controls:
                source = resolve_typescript_symbol(implementation_path, control)
                if not source and runtime:
                    source = resolve_typescript_symbol(runtime[0], control)
                control_sources.append({"name": control, **(source or {"unresolved": True})})
            receiver.append({"method": match.group(1), "path": route, "file": path.relative_to(ROOT).as_posix(),
                             "line": code[:match.start()].count("\n") + 1, "implementation": implementation,
                             "authReferences": controls, "authReferenceSources": control_sources})
    return receiver


def generate(http_only=False):
    server = NODE_ROOT / "server.py"
    endpoints = discover_node_endpoints(server)
    schemas = discover_node_schemas(server)
    receiver = discover_receiver_handlers()
    if not endpoints or not schemas or not receiver:
        raise ValueError("HTTP discovery returned an empty service inventory; source bindings require review")
    data = {"schemaVersion": 1, "scope": "Static source discovery resolves Node route bindings, inherited Pydantic fields and Receiver component exports without importing services. Control references are not complete authorization analysis.", "nodeEndpoints": endpoints, "nodeSchemas": schemas, "receiverHandlers": receiver}
    (ROOT / "docs/references/http-interface-inventory.json").write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")
    lines = ["# HTTP interfaces and source schemas", "", "**Status: CURRENT source discovery; no HTTP server was started or endpoint exercised by this generator.** This reference lists routes actually declared in the Node and Receiver implementations. The decorator and authorization-symbol references help locate controls but are not a complete authentication analysis; read the handler, middleware and environment policy together.", "", "## Node routes", ""]
    for row in endpoints:
        lines += [f"### {row['method']} `{row['path']}`", "", f"Handler: `{row['function']}`. {link(ROOT / row['file'], row['line'])}. Registration: {link(server, row['registrationLine'])}.", "", "```python", f"{row['function']}({row['signature']}) -> {row['returns']}", "```", ""]
        if row["boundRuntimePort"]:
            lines += ["The displayed HTTP signature omits the bound runtime dependency port; the implementation signature remains in the inventory.", ""]
        if row["decoratorOptions"]:
            lines += ["Declared route options:", "", *[f"- `{key} = {value}`" for key, value in row["decoratorOptions"].items()], ""]
    lines += ["## Node request and response models", "", "These are statically discovered Pydantic fields, including inherited fields and defaults where present. The inventory retains each field's declaring class and source. Model configuration is inherited through the local class graph; runtime validation, aliases and handler-specific errors remain in the linked implementation.", ""]
    for row in schemas:
        lines += [f"### {row['name']}", "", link(ROOT / row["file"], row["line"]) + ".", ""]
        if row["bases"]:
            lines += ["Inherited model sources: " + "; ".join(f"`{base['name']}` ({link(ROOT / base['file'], base['line'])})" for base in row["bases"]) + ".", ""]
        lines += ["```python", *([row["modelConfig"]] if row["modelConfig"] else []), *row["fields"], "```", ""]
    lines += ["## Receiver route handlers", "", "Paths below follow the Next.js filesystem router. Application aliases and proxies are configured separately; a Node endpoint is not automatically a Receiver endpoint.", ""]
    for row in receiver:
        lines += [f"### {row['method']} `{row['path']}`", "", link(ROOT / row["file"], row["line"]) + ".", ""]
        implementation = row["implementation"]
        lines += [f"Component: `{implementation['function']}`. {link(ROOT / implementation['file'], implementation['line'])}.", ""]
        if row["authReferences"]:
            controls = []
            for source in row["authReferenceSources"]:
                controls.append(f"`{source['name']}`" + (f" ({link(ROOT / source['file'], source['line'])})" if "file" in source else " (source unresolved)"))
            lines += ["Handler authorization/ingress control references: " + ", ".join(controls) + ".", ""]
    lines += ["## Request, error and retry interpretation", "", "Use the typed SDK contracts for intent construction. New native funding requires the canonical signed payment, exact owner-signed `tcap_funded_note_v1` deposit, restricted private opening and required `senderFundingBlockhashContext`. That tuple is client-reported routing/lifetime metadata, not an issuer signature. Confirmed funding uses its separate receipt model and does not infer missing issuance context. Receiver rejects externally created SETTLEMENT work. Worker APIs use their configured keys/session and lease controls; a public work-status response is a sanitized coordination view.", "", "`TsnHttpClient` throws a plain Error on non-2xx responses and has no automatic retry or timeout. Some Node endpoints return FastAPI `detail` errors, while Receiver routes return their own `error` fields and statuses. No generated OpenAPI availability or uniform rate limit is claimed here. Retry only after distinguishing accepted work from a lost response, and reconcile transaction signatures before reconstructing funding.", "", "See [component records](components.md), [invariants](invariants.md), and the [SDK troubleshooting guide](../../tsn-protocol/tsn-docs/sdk/troubleshooting.mdx).", ""]
    (OUT / "interface-reference.md").write_text("\n".join(lines), encoding="utf-8")

    if http_only:
        print(json.dumps({"nodeEndpoints": len(endpoints), "nodePaths": len({row["path"] for row in endpoints}), "nodeSchemas": len(schemas), "receiverHandlers": len(receiver), "receiverPaths": len({row["path"] for row in receiver}), "rustGeneration": "not requested"}))
        return

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
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--http-only", action="store_true", help="Refresh HTTP metadata without rewriting the separate Rust catalog")
    generate(http_only=parser.parse_args().http_only)
