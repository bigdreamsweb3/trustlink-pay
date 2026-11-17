import hashlib
import struct

# TcapAssetIdV1: token_program, mint, registry_version, asset_commitment.
# governance_approval precedes the status/risk enums.
def asset_entry(self, **overrides):
    """Serialize the Rust TcapAssetEntryV1 fields in Borsh declaration order."""
    fields = {'reserve_state': bytes(self.reserve), 'deposits_enabled': 1, 'withdrawals_enabled': 0, 'paused': 0, 'transfer_fee_policy': 1, 'freeze_authority_policy': 1, 'issuer_control_policy': 1, 'status': 1, 'risk_state': 1, 'deprecated': 0}
    fields.update(overrides)
    return bytearray(b''.join([hashlib.sha256(b'account:TcapAssetEntryV1').digest()[:8], struct.pack('<HH', 1, 1), bytes([2]) * 32, struct.pack('<I', 7), bytes([3]) * 32, bytes([4]) * 32, struct.pack('<I', 0), bytes(32), fields['reserve_state'], bytes([5]) * 32, bytes([6]) * 32, bytes((6, fields['deposits_enabled'], fields['withdrawals_enabled'], fields['paused'], fields['transfer_fee_policy'], fields['freeze_authority_policy'], fields['issuer_control_policy'])), bytes([7]) * 32, bytes((fields['status'], fields['risk_state'], fields['deprecated'], 255))]))
