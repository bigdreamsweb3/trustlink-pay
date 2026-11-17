from app.solana_pubkey import Pubkey

async def rpc(completed, fresh, original, reads, self, /, method, params):
    self.assertTrue(completed.value, 'latest blockhash must be selected after expensive verification')
    reads.append(method)
    if method == 'getLatestBlockhash':
        self.assertEqual(params, [{'commitment': 'confirmed'}])
        return {'result': {'context': {'slot': 140}, 'value': {'blockhash': fresh, 'lastValidBlockHeight': 1000}}}
    self.assertEqual(params, [fresh, {'commitment': 'confirmed', 'minContextSlot': 140}])
    self.assertNotEqual(params[0], str(Pubkey(original[8:40])))
    return {'result': {'context': {'slot': 141}, 'value': True}}
