import base64
from server import runtime as server
from cases.wallet_funding_transaction.functions.f003_signed_wire import signed_wire

def test_current_funding_parser_rejects_versioned_and_truncated_wires(self):
    wire, _ = signed_wire([self.deposit], self.key)
    decoded = bytearray(base64.b64decode(wire))
    decoded[65] |= 128
    with self.assertRaisesRegex(ValueError, 'Versioned TCAP funding'):
        server._parse_signed_tcap_deposit_instructions(base64.b64encode(decoded).decode())
    decoded[65] &= 127
    with self.assertRaisesRegex(ValueError, 'truncated|compact length|inconsistent'):
        server._parse_signed_tcap_deposit_instructions(base64.b64encode(decoded[:70]).decode())
