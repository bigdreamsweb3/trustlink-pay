import httpx
from datetime import datetime, timezone, timedelta


async def renewal_request(node, client, method, path, **kwargs):
    node.renewals += 1
    if node.renewals > 1:
        return httpx.Response(409, json={"error": "NODE_RELAY_LEASE_INVALID"}, request=httpx.Request(method, "https://receiver.invalid" + path))
    return httpx.Response(200, json={"id": node.job["id"], "version": node.job["version"], "lease": {
        "owner": "local-node", "version": 2, "expiresAt": (datetime.now(timezone.utc) + timedelta(seconds=60)).isoformat()}},
        request=httpx.Request(method, "https://receiver.invalid" + path))
