"""Ownership debit is eligible independently of deposit permission."""
import hashlib
from functools import partial
from app.solana_pubkey import Pubkey
from settlement.debit.resolve_debit_asset import resolve_debit_asset
from amounts.units.resolve_tcap_registered_asset import resolve_tcap_registered_asset
from .fixture import fixture
from .asset_rpc import asset_rpc


async def test_deposit_independence(self):
    node,_=fixture()
    node.TOKEN_PROGRAM_ID=Pubkey.from_string("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA")
    node.TOKEN_2022_PROGRAM_ID=Pubkey.from_string("TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb")
    mint=Pubkey(bytes([31])*32); mint_data=bytearray(82);mint_data[44]=6
    tcap=Pubkey.from_string(node.TCAP_PROGRAM_ID)
    registry=Pubkey.find_program_address([b"tcap:asset-registry:v1"],tcap)[0]
    entry,bump=Pubkey.find_program_address([b"tcap:asset-entry:v1",bytes(registry),bytes(node.TOKEN_PROGRAM_ID),bytes(mint)],tcap)
    data=bytearray(287);data[:8]=hashlib.sha256(b"account:TcapAssetEntryV1").digest()[:8]
    data[8:12]=b"\x01\x00\x01\x00";data[12:44]=bytes(registry);data[44:48]=(1).to_bytes(4,"little")
    data[48:80]=bytes(node.TOKEN_PROGRAM_ID);data[80:112]=bytes(mint);data[244]=6;data[283:286]=b"\x01\x01\x00";data[286]=bump
    node.solana_rpc=partial(asset_rpc,{str(mint):(str(node.TOKEN_PROGRAM_ID),mint_data),str(entry):(node.TCAP_PROGRAM_ID,data)})
    self.assertEqual((await resolve_debit_asset(node,str(mint)))["tokenId"],1)
    with self.assertRaises(ValueError): await resolve_tcap_registered_asset(node,str(mint))
    for offset in (8,10,247,283,284,285):
        original=data[offset];data[offset]=3
        with self.subTest(offset=offset),self.assertRaises(ValueError):await resolve_debit_asset(node,str(mint))
        data[offset]=original
