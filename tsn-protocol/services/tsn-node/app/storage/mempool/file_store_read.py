from __future__ import annotations

from app import config
import json

async def _read(self) -> dict:
    if not self.path.exists():
        return {"values": {}, "hashes": {}}
    try:
        return json.loads(self.path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        config.logger.warning("Local mempool file was invalid JSON; starting fresh: %s", self.path)
        return {"values": {}, "hashes": {}}
