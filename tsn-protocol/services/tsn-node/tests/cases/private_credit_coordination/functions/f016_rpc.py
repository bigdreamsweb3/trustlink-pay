

async def rpc(response, self, /, method, _):
    self.assertEqual(method, 'getLatestBlockhash')
    return response
