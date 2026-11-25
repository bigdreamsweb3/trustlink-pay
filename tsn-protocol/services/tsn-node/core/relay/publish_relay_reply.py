"""Retry only a cached exact response, never its underlying handler or Mother transaction signing."""
import asyncio
import httpx
import json
from storage.cache.discard_published_reply import discard_published_reply
from .reply_signature import reply_signature


from .dependencies import RelayDependencies

async def publish_relay_reply(node: RelayDependencies, client, headers: dict, job: dict) -> None:
    reply = await node.execute_relay_job(job)
    signature = reply_signature(node, job, reply)
    delay = 2.0
    while True:
        try:
            response = await node.receiver_request(client, "PATCH", "/api/internal/node/relay", headers=headers,
                json={"id": job["id"], "owner": node.TSN_NODE_ID, "version": job["version"], "requestHash": job["requestHash"],
                    "reply": {**reply, "signatureBase64": signature}})
            if response.status_code >= 500:
                raise httpx.RequestError("NODE_RELAY_REPORT_UNAVAILABLE")
            response.raise_for_status()
            # Receiver now holds the verified durable reply; its lost client response does not require local replay.
            if response.json().get("status") != "COMPLETED":
                raise ValueError("NODE_RELAY_REPORT_INVALID")
            try:
                parsed = json.loads(reply["body"]) if reply["contentType"].startswith("application/json") else None
                uncertain = parsed.get("error") if isinstance(parsed, dict) else None
            except ValueError:
                uncertain = None
            if uncertain not in {"NODE_RELAY_OUTCOME_UNKNOWN", "NODE_CACHE_INVALID", "NODE_CACHE_REQUEST_CONFLICT"}:
                async with node._local_cache_lock:
                    await asyncio.to_thread(discard_published_reply, node, job["id"])
            return
        except (httpx.RequestError, RuntimeError):
            await asyncio.sleep(delay)
            delay = min(10.0, delay * 2)
