

async def rpc(fixture, self, /, method, params):
    if method == 'getLatestBlockhash':
        self.assertEqual(params, [{'commitment': 'confirmed'}])
        return {'result': {'context': {'slot': 140}, 'value': {'blockhash': fixture[4], 'lastValidBlockHeight': 1000}}}
    self.assertEqual(params, [fixture[4], {'commitment': 'confirmed', 'minContextSlot': 140}])
    return {'result': {'context': {'slot': 140}, 'value': True}}
