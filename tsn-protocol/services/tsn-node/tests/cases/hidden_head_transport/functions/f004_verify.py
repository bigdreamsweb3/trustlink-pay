from server import runtime as server

def verify(self, message=None, transition=None):
    return server._verify_mother_signed_tcap_settlement_message(self.message if message is None else message, operator=self.operator, authority=self.authority, transition=self.transition if transition is None else transition)
