from credit_amount import commitment
from hidden_head_witness import hex_field
from gpru_crypto import poseidon_v1
from credit_amount import publish_opening

def fixture(self, directory):
    epoch = {'count': 2, 'token': 7, 'seed': hex_field(19), 'address': 'synthetic-epoch'}
    rows = []
    digest = 19
    for i, amount in enumerate((100, 400)):
        w = {'assetId': 7, 'amount': amount, 'amountBlinding': i + 21, 'nullifier': i + 31}
        w['amountCommitment'] = commitment(7, amount, w['amountBlinding'], w['nullifier'])
        publish_opening(directory, w)
        row = {'epoch': epoch['address'], 'sequence': i + 10, 'amountCommitment': hex_field(w['amountCommitment']), 'nullifier': hex_field(w['nullifier'])}
        rows.append(row)
        digest = poseidon_v1([digest, w['amountCommitment'], w['nullifier']])
    epoch['digest'] = hex_field(digest)
    return (epoch, rows)
