import base64
import hashlib
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch
from app.solana_pubkey import Pubkey
from transactions.native.funding.prepare_funding_deposit_accounts import prepare_funding_deposit_accounts
from server import runtime as node


async def test_deposit_account_preflight(self):
    accounts = self.preflight['depositAccounts']
    entry = bytearray(287)
    entry[:8] = hashlib.sha256(b'account:TcapAssetEntryV1').digest()[:8]
    entry[48:80] = bytes(Pubkey.from_string(accounts['tokenProgram']))
    entry[80:112] = bytes(Pubkey.from_string(accounts['mint']))
    entry[148:180] = bytes(Pubkey.from_string(accounts['reserveState']))
    entry[180:212] = bytes(Pubkey.from_string(accounts['vault']))
    entry[212:244] = bytes([44]) * 32
    entry[245] = entry[283] = entry[284] = 1
    config = bytearray(244)
    config[:8] = hashlib.sha256(b'account:TcapGlobalConfigV1').digest()[:8]
    reserve = bytearray(201)
    reserve[:8] = hashlib.sha256(b'account:TcapReserveStateV1').digest()[:8]
    reserve[44:76] = bytes(Pubkey.from_string(accounts['assetEntry']))
    reserve[76:108] = bytes(Pubkey.from_string(accounts['vault']))
    reserve[108:140] = bytes([44]) * 32
    reserve[188] = 1
    vault = bytearray(165)
    vault[:32] = bytes(Pubkey.from_string(accounts['mint']))
    vault[32:64] = bytes([44]) * 32
    vault[108] = 1
    source = bytearray(vault)
    source[32:64] = bytes(Pubkey.from_string(self.wallet))
    source[64:72] = (2000000).to_bytes(8, 'little')
    request = SimpleNamespace(senderWallet=self.wallet, tokenMintAddress=accounts['mint'])
    for frozen in (False, True):
        source[108] = 2 if frozen else 1
        raw = [entry, config, reserve, vault, source]
        encoded = [{'owner': node.TCAP_PROGRAM_ID if index < 3 else accounts['tokenProgram'],
                    'data': [base64.b64encode(data).decode(), 'base64']} for index, data in enumerate(raw)]
        replies = [{'result': {'value': encoded[0]}}, {'result': {'value': [*encoded[1:4], {}]}},
                   {'result': {'value': [{'pubkey': accounts['source'], 'account': encoded[4]}]}}]
        with patch.object(node, 'solana_rpc', AsyncMock(side_effect=replies)) as rpc, \
             patch('transactions.native.funding.prepare_funding_deposit_accounts.decode_funding_root', return_value={}):
            if frozen:
                with self.assertRaisesRegex(ValueError, 'sufficient funds'):
                    await prepare_funding_deposit_accounts(node, request, self.preflight['verifiedFields'], 1000000)
            else:
                prepared = await prepare_funding_deposit_accounts(node, request, self.preflight['verifiedFields'], 1000000)
                self.assertEqual(prepared['source'], accounts['source'])
                self.assertEqual(prepared['mint'], request.tokenMintAddress)
            self.assertEqual([call.args[0] for call in rpc.await_args_list], ['getAccountInfo', 'getMultipleAccounts', 'getTokenAccountsByOwner'])
