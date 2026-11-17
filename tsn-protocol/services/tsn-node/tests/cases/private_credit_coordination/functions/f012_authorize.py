

async def authorize(clock, completed, elapsed, value, work, /, _):
    pass
    clock[0] += elapsed
    completed.value = True
    return {'transition': value, 'workStateVersion': work['stateVersion']}
