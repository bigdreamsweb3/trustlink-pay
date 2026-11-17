from __future__ import annotations



async def aclose(self) -> None:
    await self.client.aclose()
