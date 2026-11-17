

async def rpc(fresh, latest, self, validity, validity_context, /, method, params):
    if method == 'getLatestBlockhash':
        return latest if latest is not None else {'result': {'context': {'slot': 140}, 'value': {'blockhash': fresh, 'lastValidBlockHeight': 1000}}}
    self.assertEqual(method, 'isBlockhashValid')
    self.assertEqual(params, [fresh, {'commitment': 'confirmed', 'minContextSlot': 140}])
    return {'result': {'context': validity_context if validity_context is not None else {'slot': 140}, 'value': validity}}
