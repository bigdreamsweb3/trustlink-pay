"""HiddenHeadWitnessStore public class with explicit method implementations."""
from __future__ import annotations
from settlement.witness.hidden_head_witness_store_init import __init__ as HiddenHeadWitnessStore_init
from settlement.witness.hidden_head_witness_store_prepare_credit import prepare_credit as HiddenHeadWitnessStore_prepare_credit
from settlement.witness.hidden_head_witness_store_finish_credit import finish_credit as HiddenHeadWitnessStore_finish_credit
from settlement.witness.hidden_head_witness_store_save_candidate import save_candidate as HiddenHeadWitnessStore_save_candidate

class HiddenHeadWitnessStore:
    __init__ = HiddenHeadWitnessStore_init

    prepare_credit = HiddenHeadWitnessStore_prepare_credit

    finish_credit = HiddenHeadWitnessStore_finish_credit

    save_candidate = HiddenHeadWitnessStore_save_candidate
