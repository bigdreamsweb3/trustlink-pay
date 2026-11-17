from server import runtime as server
from cases.wallet_funding_transaction.functions.f003_signed_wire import signed_wire

def verify(self, instructions, context=None):
    wire, _ = signed_wire(instructions, self.key)
    server._verify_signed_tcap_deposit_contract(transaction_base64=wire, transition=context or self.context, wallet=self.wallet)
