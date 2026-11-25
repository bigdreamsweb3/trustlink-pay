"""Renew one relay claim while processing/reporting; failure cancels its operation."""
import asyncio
from .assert_relay_lease import assert_relay_lease


from .dependencies import RelayDependencies

async def keep_relay_lease(node: RelayDependencies, client, headers: dict, job: dict) -> None:
    while True:
        await asyncio.sleep(15)
        response = await node.receiver_request(client, "PUT", "/api/internal/node/relay", headers=headers,
            json={"id": job["id"], "owner": node.TSN_NODE_ID, "version": job["version"], "requestHash": job["requestHash"]})
        response.raise_for_status()
        assert_relay_lease(node, job, response.json())
