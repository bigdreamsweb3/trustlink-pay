"""Reject nonloopback peers even when a custom launcher exposes the local Node application."""
from starlette.responses import JSONResponse


async def local_only_middleware(request, call_next):
    if request.client is None or request.client.host not in {"127.0.0.1", "::1", "localhost"}:
        return JSONResponse({"error": "TSN_NODE_LOCAL_ACCESS_ONLY"}, status_code=403)
    return await call_next(request)
