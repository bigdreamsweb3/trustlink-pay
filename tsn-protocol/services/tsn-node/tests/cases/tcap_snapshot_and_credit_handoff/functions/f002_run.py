from app.services.tcap_snapshot_store import EncryptedTcapSnapshotEnvelope
from app.services.tcap_snapshot_store import FileTcapSnapshotStore

async def run(tmp_path, /):
    store = FileTcapSnapshotStore(tmp_path)
    envelope = EncryptedTcapSnapshotEnvelope(version=1, sequence=4, previous_commitment='11' * 32, new_commitment='22' * 32, policy_commitment='33' * 32, transition_nullifier='44' * 32, tsn_settlement_commitment='55' * 32, created_at=1, encrypted_record_locator='enc:opaque:v1', nonce=b'123456789012', ciphertext=b'ciphertext-only')
    await store.save(envelope)
    loaded = await store.load(envelope.new_commitment)
    assert loaded == envelope
    assert b'token_balances' not in (tmp_path / f'{envelope.new_commitment}.json').read_bytes()
