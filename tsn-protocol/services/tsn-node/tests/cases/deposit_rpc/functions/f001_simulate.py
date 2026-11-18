import base64
import httpx
from unittest.mock import patch
from server import runtime as server
from cases.deposit_rpc.functions.f002_handle import handle as _case_f002_handle
from functools import partial
from cases.deposit_rpc.functions.f003_client import client as _case_f003_client

async def simulate(self, outcomes, bank_height=1001):
    seen = []
    handle = partial(_case_f002_handle, outcomes, seen, bank_height)
    real_client = httpx.AsyncClient
    client = partial(_case_f003_client, handle, real_client)
    with patch.object(server, 'TSN_SOLANA_RPC_URLS', ['https://one.test', 'https://two.test']), patch.object(server.httpx, 'AsyncClient', client):
        result = await server._simulate_owner_signed_tcap_deposit(self.wire, self.blockhash_context)
    simulations = [payload for payload in seen if payload['method'] == 'simulateTransaction']
    for payload in seen:
        self.assertEqual(payload['params'][-1]['minContextSlot'], 123)
    for payload in simulations:
        self.assertEqual(payload['params'][0], self.wire)
        self.assertTrue(payload['params'][1]['sigVerify'])
        self.assertFalse(payload['params'][1]['replaceRecentBlockhash'])
    self.assertEqual(simulations[0], simulations[-1])
    return result
