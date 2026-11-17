from __future__ import annotations
import json

async def _write(self, data: dict) -> None:
    self.path.parent.mkdir(parents=True, exist_ok=True)
    self.path.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")
