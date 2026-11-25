import httpx


async def publish_request(node, client, method, path, **kwargs):
    node.reports.append(kwargs["json"])
    if len(node.reports) == 1:
        raise httpx.RequestError("synthetic lost response")
    return httpx.Response(200, json={"id": node.job["id"], "version": node.job["version"], "status": "COMPLETED"}, request=httpx.Request(method, "https://receiver.invalid" + path))
