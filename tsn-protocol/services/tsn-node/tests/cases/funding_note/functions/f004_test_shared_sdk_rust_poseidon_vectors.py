from funding_note import funded_leaf
from funding_note import funding_nullifier
from hidden_head_witness import hex_field
from cases.funding_note.functions.f001_note import note

def test_shared_sdk_rust_poseidon_vectors(self):
    opening = note()
    self.assertEqual(opening['commitment'], '25e2b221e22ce1d857cb8b21b104432d92f39acf19f14b45818a471f03bf1756')
    self.assertEqual(funding_nullifier(opening), '1ee2226d38d357bcd4ed079b93ff555c1af28a4b5ff97562deec82704fcc6485')
    self.assertEqual(hex_field(funded_leaf(opening['commitment'], 7, 1000)), '1c546aeaea68bc79050f46c8926e37ff7d0753ca5b2b2dcbd19295c3320c9838')
