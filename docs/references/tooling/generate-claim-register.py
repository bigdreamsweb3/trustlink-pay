"""Index prose/code review units with explicit evidence and conservative status.

This is a coverage ledger, not an automated factual verifier. A paragraph may
contain multiple assertions. Source links and page review never imply live
execution. Code bodies are hashed rather than copied into this catalog.
"""
from collections import Counter
from pathlib import Path
import hashlib
import json
import re

ROOT = Path(__file__).resolve().parents[3]
REFERENCES = ROOT / "docs/references"
STATUSES = {"CURRENT", "VERIFIED", "EXPERIMENTAL", "PROPOSED", "HISTORICAL", "DEPRECATED", "RETIRED", "UNVERIFIED"}


def units(text):
    lines = text.splitlines()
    headings = []
    i = 0
    if lines and lines[0] == "---":
        i = next((j + 1 for j in range(1, len(lines)) if lines[j] == "---"), 0)
    while i < len(lines):
        line = lines[i]
        if not line.strip():
            i += 1
            continue
        heading = re.match(r"^(#{1,6})\s+(.+)$", line)
        if heading:
            level = len(heading[1])
            headings[:] = headings[:level - 1] + [heading[2]]
            i += 1
            continue
        start = i
        if line.startswith("```"):
            kind = "code"
            i += 1
            while i < len(lines) and not lines[i].startswith("```"):
                i += 1
            i += 1
        else:
            kind = "prose"
            i += 1
            while i < len(lines) and lines[i].strip() and not re.match(r"^(#{1,6})\s|^```", lines[i]):
                i += 1
        yield start + 1, " > ".join(headings), kind, "\n".join(lines[start:i])


def generate():
    documents = json.loads((REFERENCES / "documentation-inventory.json").read_text(encoding="utf-8"))["documents"]
    rules = json.loads((REFERENCES / "claim-review.json").read_text(encoding="utf-8"))["rules"]
    hits = Counter()
    rows = []
    for document in documents:
        path = document["path"]
        content = (ROOT / path).read_text(encoding="utf-8-sig")
        generated_sdk = "/api-reference/sdk/modules/" in path
        for line, heading, kind, body in units(content):
            digest = hashlib.sha256(body.encode("utf-8")).hexdigest()
            status = document["status"]
            reason = document["reason"]
            evidence = document["evidence"]
            origin = "document-disposition"
            if status == "VERIFIED":
                status = "UNVERIFIED"
                reason = "A dated verified document can contain hypotheses and interpretation; only explicit observation selectors inherit VERIFIED."
                evidence = []
                origin = "observation-scope-required"
            if generated_sdk and kind == "prose":
                status = "UNVERIFIED"
                reason = "Generated prose may include source JSDoc; extraction does not independently establish its behavior/security assertions."
                evidence = []
                origin = "generated-comment-review-required"
            if kind == "code" and not generated_sdk:
                status = "UNVERIFIED"
                reason = "Code/diagram review unit requires the separate example, syntax or source evidence; page status alone does not execute a snippet."
                evidence = []
                origin = "code-review-required"
            for rule in rules:
                if path == rule["path"] and rule["contains"] in body:
                    status = rule["status"]
                    reason = rule["reason"]
                    evidence = rule["evidence"]
                    origin = rule["id"]
                    hits[rule["id"]] += 1
            if status not in STATUSES:
                raise ValueError(f"Invalid status: {status}")
            rows.append({"id": path + "::" + digest[:16], "path": path, "line": line, "section": heading,
                         "unitKind": kind, "sha256": digest, "excerpt": body[:600] if kind == "prose" else "Code/diagram body retained at source location; not copied.",
                         "status": status, "reviewOrigin": origin, "reason": reason, "evidence": evidence})
    missing = [rule["id"] for rule in rules if not hits[rule["id"]]]
    if missing:
        raise ValueError("Claim selectors no longer match source documents: " + ", ".join(missing))
    report = {"schemaVersion": 1, "scope": "Prose paragraphs/list groups and fenced code review units across every inventoried document. Paragraphs may contain multiple technical assertions; this is conservative review coverage, not a proof of exhaustive semantic verification.",
              "classificationPolicy": "Explicit claim rules override document disposition. CURRENT describes source matching; VERIFIED is bounded to attributed observations. Generated comments and unexecuted code default UNVERIFIED. Page links cannot certify live deployment.",
              "documentsCovered": len(documents), "unitCount": len(rows), "statuses": dict(sorted(Counter(row["status"] for row in rows).items())),
              "explicitRuleMatches": dict(hits), "reviewUnits": rows}
    (REFERENCES / "technical-claim-inventory.json").write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(json.dumps({"documentsCovered": len(documents), "reviewUnits": len(rows), "explicitRules": len(rules), "statuses": report["statuses"]}))


if __name__ == "__main__":
    generate()
