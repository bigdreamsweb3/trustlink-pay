"""Offline inventory/link checks for TSN documentation and agent entry references.

No services, transactions, Git mutations, or environment-file values are read.
Run from the workspace root. Reports distinguish document classification from
behavioral verification; discovery alone never marks a claim VERIFIED.
"""
from pathlib import Path
import argparse
import hashlib
import json
import os
import re
import subprocess
from urllib.parse import unquote

ROOT = Path(__file__).resolve().parents[3]
DOC_ROOTS = (ROOT / "docs", ROOT / "tsn-protocol/tsn-docs")
ENTRY_FILES = {ROOT / "AGENTS.md", ROOT / "README.md", ROOT / "tsn-protocol/README.md"}
SKIP = {".git", "node_modules", "target", "dist", "build", ".next", ".venv", "__pycache__", ".logs"}
REPORT = ROOT / "docs/references/documentation-inventory.json"
REVIEWS = ROOT / "docs/references/document-review.json"


def walk():
    for base, dirs, files in os.walk(ROOT):
        dirs[:] = sorted(d for d in dirs if d not in SKIP)
        yield Path(base), files


def documents():
    for base, files in walk():
        for name in sorted(files):
            path = base / name
            rel = path.relative_to(ROOT).as_posix()
            if path.suffix not in {".md", ".mdx"}:
                continue
            if rel.startswith(("docs/", "tsn-protocol/", "research/", ".codex/")) or rel in {"README.md", "terminal-dev.md", "AGENTS.md"}:
                yield path


def inventory():
    reviews = json.loads(REVIEWS.read_text(encoding="utf-8")) if REVIEWS.exists() else {}
    repos = []
    for base, files in walk():
        if (base / ".git").exists():
            result = subprocess.run(["git", "-C", str(base), "rev-parse", "--show-toplevel"], capture_output=True, text=True)
            repos.append({"path": base.relative_to(ROOT).as_posix(), "gitTopLevel": result.stdout.strip().replace(str(ROOT).replace("\\", "/"), ".")})
    rows = []
    for path in documents():
        rel = path.relative_to(ROOT).as_posix()
        content = path.read_text(encoding="utf-8-sig")
        title = re.search(r"^title:\s*[\"']?(.*?)[\"']?\s*$|^#\s+(.+)$", content, re.M)
        review = reviews.get(rel, {})
        claims = [{"line": i, "text": line.strip()[:350]} for i, line in enumerate(content.splitlines(), 1)
                  if re.search(r"\b(retired|historical|deprecated|experimental|proposed|not configured|not operational|not yet|not implemented|production.ready|no generated|no.*proof.*generated)\b", line, re.I)]
        rows.append({"path": rel, "title": next((s for s in title.groups() if s), rel) if title else rel,
                     "sha256": hashlib.sha256(path.read_bytes()).hexdigest(), "lines": len(content.splitlines()),
                     "status": review.get("status", "UNVERIFIED"), "reason": review.get("reason", "Discovered and indexed; whole-document claims need source reconciliation."),
                     "evidence": review.get("evidence", []), "statusStatements": claims})
    result = {"schemaVersion": 1, "scope": "Checked-out files; this report makes no current deployment claim.", "repositories": repos, "documents": rows}
    REPORT.parent.mkdir(parents=True, exist_ok=True)
    REPORT.write_text(json.dumps(result, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    counts = {}
    for row in rows:
        counts[row["status"]] = counts.get(row["status"], 0) + 1
    print(json.dumps({"documents": len(rows), "statuses": counts, "report": REPORT.relative_to(ROOT).as_posix()}))


def check():
    issues = []
    pages = {p.relative_to(DOC_ROOTS[1]).with_suffix("").as_posix() for p in DOC_ROOTS[1].rglob("*.mdx")}
    config = json.loads((DOC_ROOTS[1] / "docs.json").read_text(encoding="utf-8"))
    def nav(value):
        if isinstance(value, dict):
            for key, item in value.items():
                if key == "pages":
                    for page in item:
                        if isinstance(page, str) and page not in pages:
                            issues.append({"file": "tsn-protocol/tsn-docs/docs.json", "target": page, "kind": "navigation"})
                        elif isinstance(page, dict):
                            nav(page)
                else:
                    nav(item)
        elif isinstance(value, list):
            for item in value:
                nav(item)
    nav(config.get("navigation", {}))
    protocol_root = ROOT / "tsn-protocol"
    for path in documents():
        exported = path.is_relative_to(protocol_root)
        if not (any(path.is_relative_to(p) for p in DOC_ROOTS)
                or exported or path.is_relative_to(ROOT / ".codex") or path in ENTRY_FILES):
            continue
        content = path.read_text(encoding="utf-8-sig")
        if content.count("```") % 2:
            issues.append({"file": path.relative_to(ROOT).as_posix(), "kind": "unclosed code fence"})
        if path.suffix == ".mdx" and not re.match(r"\A---\r?\n[\s\S]*?\r?\n---", content):
            issues.append({"file": path.relative_to(ROOT).as_posix(), "kind": "missing frontmatter"})
        # Exclude fenced code before finding Markdown links and MDX hrefs.
        prose = re.sub(r"```[\s\S]*?```", "", content)
        if (exported or path == ROOT / "README.md") and re.search(r"run[- ]your[- ]own[- ]tsn|build and operate your own TSN", prose, re.I):
            issues.append({"file": path.relative_to(ROOT).as_posix(), "kind": "premature operator-guide publication"})
        links = re.findall(r"\]\(([^)]+)\)|\b(?:href|src)=[\"']([^\"']+)[\"']|^\s*\[[^\]]+\]:\s*(\S+)", prose, re.M)
        for match in links:
            target = next(s for s in match if s).strip().strip("<>")
            if target.startswith(("http:", "https:", "mailto:", "#", "data:", "codex:")):
                continue
            target = unquote(target.split("#")[0].split("?")[0])
            if not target:
                continue
            resolved = ((DOC_ROOTS[1] / target.lstrip("/")) if target.startswith("/") and path.suffix == ".mdx" else path.parent / target).resolve()
            if exported and not resolved.is_relative_to(protocol_root.resolve()):
                issues.append({"file": path.relative_to(ROOT).as_posix(), "target": target, "kind": "exported subtree link requires bigdreamsweb3 URL"})
                continue
            candidates = [resolved, resolved.with_suffix(".mdx"), resolved.with_suffix(".md"), resolved / "index.mdx", resolved / "README.md"]
            if not any(p.exists() for p in candidates):
                issues.append({"file": path.relative_to(ROOT).as_posix(), "target": target, "kind": "local link"})
    output = ROOT / "docs/references/link-check.json"
    output.write_text(json.dumps({"scope": "Two documentation trees, all tsn-protocol Markdown, .codex Markdown and AGENTS/root README references: local targets, exported-subtree boundary, internal-only operator-guide publication, Mintlify navigation, frontmatter, fence balance. Remote URLs, anchors and Mermaid rendering require separate validation.", "issues": issues}, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"issues": len(issues), "report": output.relative_to(ROOT).as_posix()}))
    return bool(issues)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("command", choices=["inventory", "check"])
    args = parser.parse_args()
    if args.command == "inventory":
        inventory()
    else:
        raise SystemExit(check())
