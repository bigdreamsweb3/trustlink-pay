import asyncio
from pathlib import Path

from app.services.tcap_credit_handoff import build_tcap_credit_authorization
from app.services.tcap_snapshot_store import EncryptedTcapSnapshotEnvelope, FileTcapSnapshotStore


def test_snapshot_store_round_trip_is_opaque(tmp_path: Path):
    async def run():
        store = FileTcapSnapshotStore(tmp_path)
        envelope = EncryptedTcapSnapshotEnvelope(
            version=1,
            sequence=4,
            previous_commitment="11" * 32,
            new_commitment="22" * 32,
            policy_commitment="33" * 32,
            transition_nullifier="44" * 32,
            tsn_settlement_commitment="55" * 32,
            created_at=1,
            encrypted_record_locator="enc:opaque:v1",
            nonce=b"123456789012",
            ciphertext=b"ciphertext-only",
        )
        await store.save(envelope)
        loaded = await store.load(envelope.new_commitment)
        assert loaded == envelope
        assert b"token_balances" not in (tmp_path / f"{envelope.new_commitment}.json").read_bytes()

    asyncio.run(run())


def test_credit_handoff_contains_exact_credit_fields():
    auth = build_tcap_credit_authorization(
        tip="Tip111",
        previous_commitment="11" * 32,
        new_commitment="22" * 32,
        sequence=4,
        token_id=7,
        policy_commitment="33" * 32,
        gpru_scope_commitment="44" * 32,
        nullifier="55" * 32,
        valid_after_slot=10,
        expires_at_slot=20,
        tsn_settlement_commitment="66" * 32,
        epoch_id=3,
    )
    fields = auth.receipt_fields()
    assert fields["transition_type"] == "ConfidentialSettlement"
    assert fields["tip"] == "Tip111"
    assert fields["token_id"] == 7
    assert "vault" not in fields
    assert "amount" not in fields

