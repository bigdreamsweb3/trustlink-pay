"""Block real synchronous HTTP in offline component verification."""
def deny_sync_http(*args, **kwargs):
    raise RuntimeError("OFFLINE_NODE_HTTP_NETWORK_BLOCKED")
