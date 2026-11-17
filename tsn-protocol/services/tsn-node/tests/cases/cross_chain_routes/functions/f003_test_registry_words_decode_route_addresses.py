from app.services.cross_chain_routes import _word
from app.services.cross_chain_routes import _word_address

def test_registry_words_decode_route_addresses(self):
    words = ['0'.zfill(64), '1'.zfill(64), '00' * 12 + 'aa' * 20, '00' * 12 + 'bb' * 20, '00' * 12 + 'cc' * 20, '00' * 32, format(8453, '064x'), '00' * 12 + 'dd' * 20, '00' * 12 + 'ee' * 20]
    encoded = '0x' + ''.join(words)
    self.assertEqual(_word(encoded, 0), 0)
    self.assertEqual(_word(encoded, 6), 8453)
    self.assertEqual(_word_address(encoded, 7), '0x' + 'dd' * 20)
    self.assertEqual(_word_address(encoded, 8), '0x' + 'ee' * 20)
