import base64

async def rpc(GPRU, address, data, self, /, method, params):
    self.assertEqual(method, 'getAccountInfo')
    self.assertEqual(params[0], str(address))
    return {'result': {'value': {'owner': GPRU, 'data': [base64.b64encode(data).decode(), 'base64']}}}
