"""commit_epoch_to_github: extracted async component.

Inputs and outputs retain the annotations and validation below. Dependencies are
explicit structural ports; raised errors retain the original contract.
"""
from __future__ import annotations
from functools import partial
from .commit_epoch_to_github_count_statuses import commit_epoch_to_github_count_statuses
from typing import Any
import base64
import httpx
import json
import os
from typing import Any, Callable, Protocol

class Dependencies(Protocol):
    GITHUB_API: Any
    GITHUB_REPO: Any


async def commit_epoch_to_github(node: Dependencies, epoch_number: int, intents: list, closed_at: str) -> str:
    token = os.environ["GITHUB_TOKEN"]
    count_statuses = commit_epoch_to_github_count_statuses
    token_totals: dict[str, dict[str, float | int]] = {}
    for intent in intents:
        mint = str(intent.get("tokenMintAddress") or "unknown")
        row = token_totals.setdefault(mint, {"intent_count": 0, "total_amount": 0.0})
        row["intent_count"] = int(row["intent_count"]) + 1
        row["total_amount"] = float(row["total_amount"]) + float(intent.get("amount") or 0)
    record = {"epoch_number": epoch_number, "closed_at": closed_at, "privacy_model": "epoch-treasury-opaque-slot-v1", "summary": {"intent_count": len(intents), "settled_count": sum(1 for item in intents if item.get("status") in {"executed", "settled"})}, "intent_statuses": count_statuses(intents), "token_totals": token_totals}
    content_b64 = base64.b64encode((json.dumps(record, indent=2) + "\n").encode()).decode()
    file_path = f"epochs/epoch-{epoch_number}-{closed_at[:10]}.json"
    headers = {"Authorization": f"Bearer {token}", "Accept": "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28"}
    async with httpx.AsyncClient(timeout=30) as client:
        check = await client.get(f"{node.GITHUB_API}/repos/{node.GITHUB_REPO}/contents/{file_path}", headers=headers)
        payload: dict[str, Any] = {"message": f"epoch {epoch_number} closed at {closed_at}", "content": content_b64}
        if check.status_code == 200: payload["sha"] = check.json().get("sha")
        resp = await client.put(f"{node.GITHUB_API}/repos/{node.GITHUB_REPO}/contents/{file_path}", json=payload, headers=headers)
        if resp.status_code not in (200, 201): raise RuntimeError(f"GitHub commit failed ({resp.status_code}): {resp.text[:400]}")
        return resp.json()["content"]["html_url"]
