import asyncio

async def never_finishes(self, work):
    try:
        await asyncio.Event().wait()
    finally:
        self.cancelled.set()
