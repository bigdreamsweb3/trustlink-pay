"""Mirror a claimed work's bounded public metadata outside the event loop, preserving remote lease authority."""
import asyncio
from .remember_local_work import remember_local_work


from .dependencies import CacheDependencies

async def cache_receiver_work(node: CacheDependencies, work: dict) -> None:
    try:
        async with node._local_cache_lock:
            await asyncio.to_thread(remember_local_work, node, work)
    except (OSError, ValueError):
        node.logger.warning("Local coordination metadata cache unavailable; current Receiver lease remains authoritative")
