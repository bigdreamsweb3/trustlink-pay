import copy
from server import runtime as server

def test_public_projection_removes_funding_opening_and_nested_witness(self):
    private = copy.deepcopy(self.transition)
    private['fundingNote'] = {'secret': 'private', 'blinding': 'private', 'commitment': 'private'}
    private['fundingSiblings'] = ['private']
    private['proof']['fundingSecret'] = 'private'
    self.assertEqual(server._public_tcap_transition(private), self.transition)
