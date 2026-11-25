"""Drain one outbound request lane; each lane has one handler and sleeps when no notification remains."""
import asyncio
import httpx
from .process_relay_job import process_relay_job


from .dependencies import RelayDependencies

async def relay_worker(node: RelayDependencies, lane: str) -> None:
    headers = {"x-api-key": node.TSN_RECEIVER_NODE_API_KEY, "content-type": "application/json"}
    wake = node._relay_wake_events[lane]
    async with httpx.AsyncClient(timeout=30) as client:
        while True:
            await wake.wait()
            wake.clear()
            failures = 0
            while True:
                try:
                    response = await node.receiver_request(client, "POST", "/api/internal/node/relay", headers=headers,
                        json={"owner": node.TSN_NODE_ID, "lane": lane})
                    response.raise_for_status()
                    job = response.json().get("job")
                    if not job:
                        break
                    await process_relay_job(node, client, headers, job)
                    failures = 0
                except asyncio.CancelledError:
                    raise
                except Exception:
                    failures += 1
                    node.logger.warning("Local Node relay unavailable: lane=%s failures=%d", lane, failures)
                    if failures >= 6:
                        break
                    await asyncio.sleep(min(30.0, 2.0 ** failures))
