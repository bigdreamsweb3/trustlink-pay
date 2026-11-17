import base64
import httpx
from unittest.mock import patch
from server import runtime as server
from cases.deposit_rpc.functions.f002_handle import handle as _case_f002_handle
from functools import partial
from cases.deposit_rpc.functions.f003_client import client as _case_f003_client

async def simulate(self, outcomes):
    seen = []
    handle = partial(_case_f002_handle, outcomes, seen)
    real_client = httpx.AsyncClient
    client = partial(_case_f003_client, handle, real_client)
    with patch.object(server, 'TSN_SOLANA_RPC_URLS', ['https://one.test', 'https://two.test']), patch.object(server.httpx, 'AsyncClient', client):
        result = await server._simulate_owner_signed_tcap_deposit(base64.b64encode(b'synthetic-wire').decode())
    for payload in seen:
        self.assertTrue(payload['params'][1]['sigVerify'])
        self.assertFalse(payload['params'][1]['replaceRecentBlockhash'])
    self.assertEqual(seen[0], seen[-1])
    return result
