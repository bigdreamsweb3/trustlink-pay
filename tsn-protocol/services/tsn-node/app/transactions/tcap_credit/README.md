# Retained opaque TCAP handoff model

`TcapCreditAuthorizationV2` preserves its opaque commitment/scalar validation and `instruction_fields` projection. `build_tcap_credit_authorization` retains the caller-facing constructor. The exact V2 name belongs to this retained model; it does not rename or replace the active private-amount/native-credit instruction family.

`app.services.tcap_credit_handoff` remains the public interface. The model has no transaction-submission behavior and accepts no plaintext balance field. `tests/test_tcap_snapshot_and_credit_handoff.py` covers construction and projection alongside the retained encrypted snapshot adapter.
