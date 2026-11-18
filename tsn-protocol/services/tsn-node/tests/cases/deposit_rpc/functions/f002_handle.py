import httpx

async def handle(outcomes, seen, bank_height, /, request):
    import json
    seen.append(json.loads(request.content))
    if seen[-1]['method'] == 'getBlockHeight':
        if isinstance(bank_height, Exception):
            raise bank_height
        return httpx.Response(200, json={'result': bank_height})
    outcome = outcomes[sum(payload['method'] == 'simulateTransaction' for payload in seen) - 1]
    if isinstance(outcome, Exception):
        raise outcome
    if isinstance(outcome, dict) and isinstance(outcome.get('result'), dict) and 'context' not in outcome['result']:
        outcome = {**outcome, 'result': {**outcome['result'], 'context': {'slot': 123}}}
    return httpx.Response(200, json=outcome)
