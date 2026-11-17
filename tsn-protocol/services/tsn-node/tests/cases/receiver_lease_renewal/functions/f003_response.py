import httpx

def response(self, status, body):
    return httpx.Response(status, json=body, request=httpx.Request('POST', 'http://receiver.test/api/internal/node/work'))
