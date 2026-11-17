from app.services.tcap_credit_handoff import build_tcap_credit_authorization

def test_credit_handoff_contains_exact_credit_fields():
    auth = build_tcap_credit_authorization(tip='Tip111', previous_commitment='11' * 32, new_commitment='22' * 32, sequence=4, token_id=7, policy_commitment='33' * 32, gpru_scope_commitment='44' * 32, nullifier='55' * 32, valid_after_slot=10, expires_at_slot=20, authorization_digest='66' * 32)
    fields = auth.instruction_fields()
    assert fields['tip'] == 'Tip111'
    assert fields['token_id'] == 7
    assert 'vault' not in fields
    assert 'amount' not in fields
