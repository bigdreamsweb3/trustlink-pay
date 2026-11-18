import json
import httpx


async def transport_envelope(malformed, request):
    body = malformed if request.url.host == 'one.test' else {'jsonrpc': '2.0', 'result': 'ok', 'id': 1}
    return httpx.Response(200, content=json.dumps(body), headers={'Content-Type': 'application/json'})
