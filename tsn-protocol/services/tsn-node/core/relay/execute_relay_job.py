"""Use a checkpointed exact reply after restart; execute a fresh request only after local reservation."""
import asyncio
import json
from storage.cache.load_cached_reply import load_cached_reply
from storage.cache.reserve_local_reply import reserve_local_reply
from storage.cache.save_local_reply import save_local_reply
from .validate_relay_job import validate_relay_job


from .dependencies import RelayDependencies

async def execute_relay_job(node: RelayDependencies, job: dict) -> dict:
    validate_relay_job(job)
    try:
        async with node._local_cache_lock:
            cached = await asyncio.to_thread(load_cached_reply, node, job)
            if cached is None:
                await asyncio.to_thread(reserve_local_reply, node, job)
        if cached is not None:
            return cached
    except ValueError as exc:
        reason = str(exc)
        if reason not in ("NODE_RELAY_OUTCOME_UNKNOWN", "NODE_CACHE_FULL", "NODE_CACHE_INVALID", "NODE_CACHE_REQUEST_CONFLICT"):
            reason = "NODE_CACHE_INVALID"
        return {"status": 409, "body": json.dumps({"error": reason}), "contentType": "application/json"}
    reply = await node.dispatch_relay_job(job)
    async with node._local_cache_lock:
        await asyncio.to_thread(save_local_reply, node, job, reply)
    return reply
