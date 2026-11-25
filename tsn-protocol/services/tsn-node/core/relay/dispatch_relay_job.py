"""Use existing ASGI handlers and authorization checks locally; no socket, URL or executable command is dispatched."""
import httpx
from .validate_relay_job import validate_relay_job


from .dependencies import RelayDependencies

async def dispatch_relay_job(node: RelayDependencies, job: dict) -> dict:
    request = validate_relay_job(job)
    headers = {**request["headers"], "x-api-key": node.TSN_RECEIVER_NODE_API_KEY}
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=node._relay_app, raise_app_exceptions=False), base_url="http://tsn-node.local", timeout=600) as client:
        response = await client.request(request["method"], request["path"] + request["search"], headers=headers, content=request["body"])
    if len(response.content) > 262144:
        raise ValueError("NODE_RELAY_REPLY_TOO_LARGE")
    return {"status": response.status_code, "body": response.text, "contentType": response.headers.get("content-type", "application/json")}
