import httpx

def client(handle, real_client, /, **kwargs):
    return real_client(transport=httpx.MockTransport(handle), **kwargs)
