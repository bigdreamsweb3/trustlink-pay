import httpx


async def request(node, client, method, path, **kwargs):
    node.requests.append(kwargs["json"])
    fast = kwargs["json"].get("fundingPhase") == "SIGNED_DEPOSIT"
    node.events.append("fast-claim" if fast else "normal-claim")
    if node.failure is not None:
        raise node.failure
    queue = node.fast if fast else node.normal
    return httpx.Response(200, json={"work": queue.popleft() if queue else None},
                          request=httpx.Request(method, "http://receiver.test" + path))
