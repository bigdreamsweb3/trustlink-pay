import httpx

async def handle(outcomes, seen, /, request):
    import json
    seen.append(json.loads(request.content))
    outcome = outcomes[len(seen) - 1]
    if isinstance(outcome, Exception):
        raise outcome
    return httpx.Response(200, json=outcome)
