"""Bound a relay handler/report by its live lease and cancel every child on loss, timeout or shutdown."""
import asyncio
from .keep_relay_lease import keep_relay_lease
from .publish_relay_reply import publish_relay_reply
from .assert_relay_lease import assert_relay_lease
from .validate_relay_job import validate_relay_job


from .dependencies import RelayDependencies

async def process_relay_job(node: RelayDependencies, client, headers: dict, job: dict) -> None:
    validate_relay_job(job)
    response = await node.receiver_request(client, "PUT", "/api/internal/node/relay", headers=headers,
        json={"id": job["id"], "owner": node.TSN_NODE_ID, "version": job["version"], "requestHash": job["requestHash"]})
    response.raise_for_status()
    assert_relay_lease(node, job, response.json())
    operation = asyncio.create_task(publish_relay_reply(node, client, headers, job))
    renewal = asyncio.create_task(keep_relay_lease(node, client, headers, job))
    try:
        done, _ = await asyncio.wait({operation, renewal}, timeout=600, return_when=asyncio.FIRST_COMPLETED)
        if operation in done:
            operation.result()
        elif renewal in done:
            renewal.result()
        else:
            raise TimeoutError("NODE_RELAY_PROCESSING_DEADLINE")
    finally:
        operation.cancel()
        renewal.cancel()
        await asyncio.gather(operation, renewal, return_exceptions=True)
