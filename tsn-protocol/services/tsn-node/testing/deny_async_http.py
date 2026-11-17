"""Block real asynchronous HTTP; ASGI and mocked transports remain usable."""
async def deny_async_http(*args, **kwargs):
    raise RuntimeError("OFFLINE_NODE_HTTP_NETWORK_BLOCKED")
