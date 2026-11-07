import base64
import hashlib
import struct
import unittest
from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, patch

from fastapi import HTTPException
import server
from app.solana_pubkey import Pubkey


class HiddenHeadPreconditionTests(unittest.IsolatedAsyncioTestCase):
    def asset_entry(self, **overrides):
        """Serialize the Rust TcapAssetEntryV1 fields in Borsh declaration order."""
        fields = {
            "reserve_state": bytes(self.reserve), "deposits_enabled": 1,
            "withdrawals_enabled": 0, "paused": 0, "transfer_fee_policy": 1,
            "freeze_authority_policy": 1, "issuer_control_policy": 1,
            "status": 1, "risk_state": 1, "deprecated": 0,
        }
        fields.update(overrides)
        return bytearray(b"".join([
            hashlib.sha256(b"account:TcapAssetEntryV1").digest()[:8],
            struct.pack("<HH", 1, 1), bytes([2]) * 32, struct.pack("<I", 7),
            # TcapAssetIdV1: token_program, mint, registry_version, asset_commitment.
            bytes([3]) * 32, bytes([4]) * 32, struct.pack("<I", 0), bytes(32),
            fields["reserve_state"], bytes([5]) * 32, bytes([6]) * 32,
            bytes((6, fields["deposits_enabled"], fields["withdrawals_enabled"], fields["paused"],
                   fields["transfer_fee_policy"], fields["freeze_authority_policy"], fields["issuer_control_policy"])),
            bytes([7]) * 32,  # governance_approval precedes the status/risk enums.
            bytes((fields["status"], fields["risk_state"], fields["deprecated"], 255)),
        ]))

    def setUp(self):
        tcap = Pubkey.from_string(server.TCAP_PROGRAM_ID)
        self.root, _ = Pubkey.find_program_address([b"tcap:commitment-root:v1"], tcap)
        self.config, _ = Pubkey.find_program_address([b"tcap:global-config:v1"], tcap)
        self.asset = Pubkey(bytes([9]) * 32)
        self.reserve = Pubkey(bytes([10]) * 32)
        self.funding_root, _ = Pubkey.find_program_address([b"tcap:sealed-funding:v1", bytes(self.asset), bytes([2])*32], tcap)
        self.epoch = Pubkey.find_program_address([b"tcap:credit-epoch:v1", bytes(self.asset), bytes(8)], tcap)[0]
        self.funding_state = {"address": str(self.funding_root), "root": (bytes([2]) * 32).hex(), "count": 1}
        self.records = [bytearray(272), bytearray(124), bytearray(287), bytearray(201)]
        for data, account_name in zip(self.records, ("TcapGlobalConfigV1", "TcapCommitmentRootStateV1", "TcapAssetEntryV1", "TcapReserveStateV1")):
            data[:8] = hashlib.sha256(f"account:{account_name}".encode()).digest()[:8]
            data[8:10] = b"\x01\x00"
        config, root, asset, reserve = self.records
        config[142:174] = bytes(Pubkey.from_string(server.TSN_PROGRAM_ID))
        config[208:240] = bytes(self.root)
        root[12:44] = bytes([1]) * 32
        root[80:88] = (7).to_bytes(8, "little")
        self.records[2] = self.asset_entry()
        self.assertEqual(len(self.records[2]), 287)
        reserve[44:76] = bytes(self.asset)
        reserve[140:148] = (2000).to_bytes(8, "little")
        reserve[148:156] = (1000).to_bytes(8, "little")
        reserve[156:164] = (1000).to_bytes(8, "little")
        self.transition = {"commitmentRoot": str(self.root), "previousTcapRoot": (bytes([1]) * 32).hex(), "tcapRootSequence": "8",
                           "tcapConfig": str(self.config), "assetEntry": str(self.asset), "reserveState": str(self.reserve),
                           "validAfterSlot": "40", "expiresAtSlot": "100", "amountCommitment": "03"*32, "accountingEpoch": str(self.epoch), "tokenId": 7,
                           "fundingRootAccount": str(self.funding_root), "proof": {"publicInputs": ["01" * 32] * 12 + [self.funding_state["root"]]}}
        self.root_patch = patch.object(server, "_read_tcap_shared_replay_root", new=AsyncMock(return_value=(str(self.root), bytes([1]) * 32, 7)))
        self.root_patch.start()
        self.addCleanup(self.root_patch.stop)
        self.funding_patch = patch.object(server, "read_sealed_pool", new=AsyncMock(side_effect=lambda *_: self.funding_state))
        self.funding_patch.start()
        self.addCleanup(self.funding_patch.stop)

    async def check(self):
        response = {"result": {"context": {"slot": 50}, "value": [{"owner": server.TCAP_PROGRAM_ID, "data": [base64.b64encode(data).decode(), "base64"]} for data in self.records]}}
        with patch.object(server, "solana_rpc", new=AsyncMock(return_value=response)):
            await server._assert_tcap_gpru_credit_program_preconditions(self.transition)

    async def test_canonical_funded_reserve_passes(self):
        await self.check()

    async def test_credit_does_not_require_withdrawals_or_zero_policy_flags(self):
        for overrides in ({"withdrawals_enabled": 0}, {"withdrawals_enabled": 1},
                          {"transfer_fee_policy": 0, "freeze_authority_policy": 0, "issuer_control_policy": 0}):
            with self.subTest(overrides=overrides):
                self.records[2] = self.asset_entry(**overrides)
                await self.check()

    async def test_pending_reclassification_does_not_gate_an_individual_credit(self):
        self.records[3][148:156] = (499).to_bytes(8, "little")
        await self.check()

    async def test_insolvency_fails(self):
        self.records[3][140:148] = (1999).to_bytes(8, "little")
        with self.assertRaisesRegex(ValueError, "insolvent"):
            await self.check()

    async def test_transfer_liabilities_are_included(self):
        self.records[3][193:201] = (1).to_bytes(8, "little")
        with self.assertRaisesRegex(ValueError, "insolvent"):
            await self.check()

    async def test_inactive_unapproved_paused_or_deprecated_asset_fails(self):
        for overrides in ([{"status": status} for status in (0, 2, 3, 4)]
                          + [{"risk_state": risk} for risk in (0, 2, 3)]
                          + [{"paused": 1}, {"deprecated": 1}]):
            with self.subTest(overrides=overrides):
                self.records[2] = self.asset_entry(**overrides)
                with self.assertRaisesRegex(ValueError, "unavailable|reserve binding"):
                    await self.check()

    async def test_wrong_reserve_binding_fails(self):
        self.records[2] = self.asset_entry(reserve_state=bytes([11]) * 32)
        with self.assertRaisesRegex(ValueError, "reserve binding"):
            await self.check()

    async def test_root_change_fails(self):
        self.records[1][12] ^= 1
        with self.assertRaisesRegex(ValueError, "authorized predecessor"):
            await self.check()

    async def test_funding_root_change_or_empty_tree_fails(self):
        for change in ({"root": (bytes([3]) * 32).hex()}, {"count": 0}, {"address": str(self.asset)}):
            with self.subTest(change=change):
                original = self.funding_state.copy()
                self.funding_state.update(change)
                reason = server.FUNDING_ROOT_CHANGED if "root" in change else "funding membership account is invalid or unavailable"
                with self.assertRaisesRegex(ValueError, reason):
                    await self.check()
                self.funding_state = original

    async def test_expired_slot_window_fails(self):
        self.transition["expiresAtSlot"] = "49"
        with self.assertRaisesRegex(ValueError, "slot validity window"):
            await self.check()

    def test_cranker_lease_must_be_current_and_owned(self):
        work = {"kind": "SETTLEMENT", "status": "CRANKER_LEASED", "crankerLease": {"owner": "mock operator", "expiresAt": (datetime.now(timezone.utc) + timedelta(seconds=60)).isoformat()}}
        server._assert_current_settlement_lease(work, "mock operator")
        with self.assertRaisesRegex(HTTPException, "not leased"):
            server._assert_current_settlement_lease(work, "another operator")
        work["crankerLease"]["expiresAt"] = (datetime.now(timezone.utc) - timedelta(seconds=1)).isoformat()
        with self.assertRaisesRegex(HTTPException, "expired"):
            server._assert_current_settlement_lease(work, "mock operator")


if __name__ == "__main__":
    unittest.main()
