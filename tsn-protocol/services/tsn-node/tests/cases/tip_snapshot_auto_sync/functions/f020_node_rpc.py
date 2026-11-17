

async def node_rpc(self, /, method, params):
    if method == 'getSlot':
        raise RuntimeError('stop after synchronized snapshot')
    return await self.rpc(method, params)
