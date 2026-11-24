from __future__ import annotations
import asyncio
import copy
from dataclasses import dataclass, field
from functools import partial
from typing import Any
from core import configuration as settings
from app.receiver_store import ReceiverStore
from app.services.cross_chain_routes import ready_destination_networks
from app.services.cross_chain_routes import verify_destination_route
from app.services.route_attestation import canonical_route_amount
from app.services.route_attestation import canonical_route_message
from app.services.route_attestation import sign_route_message
from app.services.threshold_access import ThresholdAccessError
from app.services.threshold_access import create_signed_nonce_receipt
from app.services.threshold_access import nonce_storage_key
from app.services.threshold_access import threshold_request_commitment
from app.services.threshold_access import verify_threshold_access_request
from app.solana_pubkey import Pubkey
from contextlib import asynccontextmanager
from credit_amount import commitment as credit_amount_commitment
from credit_amount import read_opening
from cryptography.exceptions import InvalidTag
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from datetime import datetime
from datetime import timezone
from dbrix_transaction_record import BN254_SCALAR_MODULUS
from dbrix_transaction_record import encrypt_transaction_record_v1
from dbrix_transaction_record import validate_transaction_record_v1
from decimal import Decimal
from decimal import InvalidOperation
from dotenv import load_dotenv
from fastapi import Depends
from fastapi import FastAPI
from fastapi import HTTPException
from fastapi import Header
from fastapi import Path as ApiPath
from fastapi import Query
from fastapi import Request
from fastapi.exception_handlers import request_validation_exception_handler
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from funding_note import funding_nullifier
from funding_note import validate_funding_note
from funding_snapshot_sync import FUNDING_ROOT_CHANGED
from funding_snapshot_sync import FUNDING_ROOT_INVALID
from funding_snapshot_sync import ensure_funding_snapshot
from funding_snapshot_sync import funding_membership
from funding_snapshot_sync import funding_root_address
from funding_snapshot_sync import read_funding_root
from funding_snapshot_sync import select_funding_root
from gpru_crypto import derive_node_record_shared_point
from hidden_head_prover import PUBLIC_SIGNALS
from hidden_head_prover import prove_hidden_head_credit
from hidden_head_witness import HiddenHeadWitnessStore
from hidden_head_witness import hex_field
from nacl.exceptions import BadSignatureError
from nacl.exceptions import CryptoError
from nacl.public import Box
from nacl.public import PrivateKey
from nacl.public import PublicKey as Curve25519PublicKey
from nacl.signing import SigningKey
from nacl.signing import VerifyKey
from pathlib import Path
from private_credit_coordination import PrivateCreditWait
from private_credit_coordination import build_epoch_witness
from private_credit_coordination import epoch_credits
from private_credit_coordination import read_epoch
from tcap_epoch_prover import prove_epoch
from pydantic import BaseModel
from pydantic import ConfigDict
from pydantic import Field
from pydantic import ValidationError
from tip_snapshot_sync import ensure_tip_snapshot
from typing import Literal
from typing import Optional
from uuid import uuid4
import base64
import binascii
import glob
import hashlib
import hmac
import httpx
import json
import logging
import math
import os
import re
import secrets
import struct
import time
import uvicorn
from storage.firebase.types import FirebaseStore
from storage.local.types import FileStore
from core.schemas.create_intent_request import CreateIntentRequest
from core.schemas.mempool_intent import MempoolIntent
from core.schemas.public_mempool_intent import PublicMempoolIntent
from core.schemas.signed_lease_permit_request import SignedLeasePermitRequest
from core.schemas.intent_work_item import IntentWorkItem
from core.schemas.update_status_request import UpdateStatusRequest
from core.schemas.cranker_heartbeat_request import CrankerHeartbeatRequest
from core.schemas.cranker_heartbeat_record import CrankerHeartbeatRecord
from core.schemas.epoch_status import EpochStatus
from core.schemas.epoch_close_result import EpochCloseResult
from core.schemas.mempool_status_request import MempoolStatusRequest
from core.schemas.mempool_status_response import MempoolStatusResponse
from core.schemas.intent_to_settlement_metrics import IntentToSettlementMetrics
from core.schemas.uptime_metrics import UptimeMetrics
from core.schemas.metrics_response import MetricsResponse
from core.schemas.token_network_status import TokenNetworkStatus
from core.schemas.network_overview_response import NetworkOverviewResponse
from core.environment import clean_env
from networking.receiver import receiver_endpoints
from networking.receiver import receiver_request
from amounts.units import get_supported_token_mints
from amounts.units import get_supported_token_metadata
from amounts.units import resolve_tcap_registered_asset
from amounts.units import parse_optional_float
from amounts.units import ui_amount_to_base_units
from verification.encoding import encode_base58
from verification.encoding import decode_base58
from verification.encoding import decode_secret_key
from transactions.native.accounts import get_program_pubkey
from transactions.native.accounts import find_tsn_pda
from transactions.native.accounts import get_mother_escrow_pda
from transactions.native.accounts import get_epoch_treasury_pda
from transactions.native.accounts import get_epoch_ledger_pda
from transactions.native.accounts import get_epoch_claim_slot_pda
from transactions.native.accounts import get_settlement_dna_pda
from transactions.native.accounts import derive_claim_slot
from transactions.native.accounts import get_cranker_pda
from transactions.native.accounts import get_cranker_vault_pda
from transactions.native.accounts import get_cranker_vault_token_pda
from transactions.native.accounts import get_associated_token_address
from verification.receipts import get_settlement_authorization_signing_key
from verification.receipts import _stable_verification_json
from verification.receipts import _node_verification_signing_key
from verification.receipts import _node_verification_message
from verification.receipts import _public_coordination
from verification.receipts import _sign_node_verification
from verification.receipts import settlement_authorization_signer_pubkey
from verification.authorization import require_worker_api_key
from verification.authorization import lease_authorization_message
from verification.authorization import lease_id_hash
from verification.authorization import verify_lease_authorization
from verification.authorization import decrypt_settlement_token
from verification.authorization import private_payout_permit_message
from storage.coordination import get_store
from storage.coordination import get_mempool_store
from storage.coordination import k_intents
from storage.coordination import k_epoch
from storage.coordination import k_crankers
from storage.coordination import k_tin_operation_nonces
from storage.coordination import k_canonical_message_nonces
from storage.coordination import k_threshold_access_nonces
from storage.coordination import k_recipient_route_binding
from storage.coordination import hget_all_json
from verification.identity import write_recipient_route_binding
from verification.identity import private_settlement_commitment
from verification.identity import read_recipient_route_binding
from core.archive import read_epoch_state
from core.archive import parse_iso
from core.archive import next_close_for_state
from core.archive import is_epoch_due
from core.archive import build_epoch_status
from networking.solana import get_token_account_balance_ui
from networking.solana import solana_rpc
from verification.identity import get_tins_program_pubkey
from verification.identity import get_private_tin_pda
from verification.identity import decode_private_tin_route_material
from verification.identity import resolve_tin_identity_for_verification
from verification.identity import read_tins_account_data
from verification.identity import read_onchain_tin_tip_route
from networking.liquidity import get_program_accounts
from networking.liquidity import read_onchain_cranker_vaults
from networking.liquidity import read_public_vault_liquidity
from networking.liquidity import read_public_vault_liquidity_cached
from api.projection import public_intent
from verification.intent import _field
from verification.intent import _require_string
from verification.intent import _decode_hash32
from verification.intent import _canonical_tin_owner_intent_message
from verification.intent import _decode_base64_blob
from verification.intent import _decode_owner_pubkey
from verification.intent import _expiry_from_input
from verification.intent import _sha256_hex_utf8
from verification.intent import _encode_signed_i64_le
from verification.intent import _encode_u32_le
from verification.intent import _build_canonical_message
from verification.intent import _parse_canonical_message
from verification.intent import _parse_usdc_base_units
from verification.intent import _parse_canonical_expiry
from verification.intent import _assert_canonical_nonce_unused
from verification.intent import _assert_recipient_hash_matches_owner
from verification.intent import _verify_payment_authorization_from_signed_message
from verification.identity import _normalize_tin_operation_input
from verification.signatures import _decode_base64_signature
from verification.signatures import _verify_ed25519_signature
from verification.identity import assert_tin_operation_can_enter
from core.archive import commit_epoch_to_github
from core.archive import close_epoch_task
from transactions.native.validation import _tcap_credit_bytes32
from transactions.native.validation import _tcap_credit_u64
from transactions.native.validation import _read_tcap_shared_replay_root
from transactions.native.validation import _validate_tcap_credit_digest
from transactions.native.funding import _simulate_owner_signed_tcap_deposit
from transactions.native.serialization import _read_solana_shortvec
from transactions.native.serialization import _parse_solana_v1_message
from transactions.native.signing import _mother_authority_signing_key
from transactions.native.signing import _assert_mother_authority_key_matches_chain
from transactions.native.signing import _verify_mother_signed_tcap_settlement_message
from transactions.native.funding import _parse_signed_tcap_deposit_instructions
from transactions.native.funding import _select_tcap_private_funding_deposit
from transactions.native.funding import _verify_signed_tcap_deposit_contract
from transactions.native.funding import _verify_confirmed_tcap_deposit
from transactions.native.validation import _assert_tcap_gpru_credit_program_preconditions
from transactions.native.validation import _public_tcap_transition
from transactions.native.validation import _tcap_credit_v1_wire_size
from transactions.native.validation import _assert_tcap_credit_transport_capacity
from verification.credit import _read_gpru_proof_accounts
from verification.credit import _settlement_funding_context
from verification.accounting import _current_credit_epoch
from verification.accounting import _coordinate_private_credit_work
from verification.accounting import _verify_private_coordination_work
from verification.credit import _construct_verified_tcap_transition
from verification.settlement import _assert_stored_settlement_attestation
from verification.settlement import _assert_current_settlement_lease
from verification.work import _verify_receiver_work
from core.worker import _renew_receiver_node_lease
from core.worker import _verify_and_report_receiver_work
from core.worker import _process_receiver_work_with_lease
from core.worker import receiver_verification_worker
from core.worker import _receiver_work_by_id
from core.worker import _receiver_verified_payload
from core.lifecycle import lifespan
from api.handlers import wake_receiver_verification
from verification.work import _verification_rejection_reason
from api.handlers import private_payment_validation_error
from verification.credit import _assert_authorized_credit_preconditions
from verification.accounting import _authorize_private_coordination
from verification.accounting import _verify_private_coordination_message
from api.handlers import create_settlement_authorization
from transactions.native.signing import _assert_unsigned_native_settlement
from transactions.native.signing import _native_blockhash_lifetime
from transactions.native.signing import sign_settlement_transaction
from api.handlers import mempool_status
from api.handlers import consume_threshold_access_nonce
from api.handlers.prepare_tin_debit import prepare_tin_debit_request
from api.handlers.post_tin_debit import post_tin_debit
from api.handlers import post_intent
from api.handlers import get_network_recent_blockhash
from api.handlers import post_funding_readiness, post_complete_funding
from api.handlers import list_intents
from api.handlers import update_intent_status
from api.handlers import list_pending_intent_work
from api.handlers import get_metrics
from api.handlers import post_cranker_heartbeat
from api.handlers import get_settlement_networks
from api.handlers import get_network_overview
from api.handlers import get_epoch_status
from api.handlers import close_epoch

@dataclass(repr=False)
class NodeRuntime:
    """Composition root. Replace declared ports on an instance for isolated tests."""
    ALLOW_DIRECT_FIREBASE_STORE: Any = field(default_factory=partial(copy.copy, settings.ALLOW_DIRECT_FIREBASE_STORE))
    ALLOW_LOCAL_JSON_STORE: Any = field(default_factory=partial(copy.copy, settings.ALLOW_LOCAL_JSON_STORE))
    ASSOCIATED_TOKEN_PROGRAM_ID: Any = field(default_factory=partial(copy.copy, settings.ASSOCIATED_TOKEN_PROGRAM_ID))
    BASE58_ALPHABET: Any = field(default_factory=partial(copy.copy, settings.BASE58_ALPHABET))
    CRANKER_HEARTBEAT_TTL_SECS: Any = field(default_factory=partial(copy.copy, settings.CRANKER_HEARTBEAT_TTL_SECS))
    CRANKER_VAULT_ACCOUNT_SIZE: Any = field(default_factory=partial(copy.copy, settings.CRANKER_VAULT_ACCOUNT_SIZE))
    CRANKER_VAULT_DISCRIMINATOR: Any = field(default_factory=partial(copy.copy, settings.CRANKER_VAULT_DISCRIMINATOR))
    DEVNET_USDC_MINT: Any = field(default_factory=partial(copy.copy, settings.DEVNET_USDC_MINT))
    EPOCH_HOURS: Any = field(default_factory=partial(copy.copy, settings.EPOCH_HOURS))
    EPOCH_SECS: Any = field(default_factory=partial(copy.copy, settings.EPOCH_SECS))
    FIREBASE_COLLECTION: Any = field(default_factory=partial(copy.copy, settings.FIREBASE_COLLECTION))
    GITHUB_API: Any = field(default_factory=partial(copy.copy, settings.GITHUB_API))
    GITHUB_REPO: Any = field(default_factory=partial(copy.copy, settings.GITHUB_REPO))
    GPRU_PROGRAM_ID: Any = field(default_factory=partial(copy.copy, settings.GPRU_PROGRAM_ID))
    HOST: Any = field(default_factory=partial(copy.copy, settings.HOST))
    LEASE_AUTH_MAX_AGE_SECS: Any = field(default_factory=partial(copy.copy, settings.LEASE_AUTH_MAX_AGE_SECS))
    MEMPOOL_API_KEY: Any = field(default_factory=partial(copy.copy, settings.MEMPOOL_API_KEY))
    MEMPOOL_FILE: Any = field(default_factory=partial(copy.copy, settings.MEMPOOL_FILE))
    MEMPOOL_LEASE_DOMAIN: Any = field(default_factory=partial(copy.copy, settings.MEMPOOL_LEASE_DOMAIN))
    MEMPOOL_NS: Any = field(default_factory=partial(copy.copy, settings.MEMPOOL_NS))
    MEMPOOL_STORE: Any = field(default_factory=partial(copy.copy, settings.MEMPOOL_STORE))
    PERMIT_TTL_SECS: Any = field(default_factory=partial(copy.copy, settings.PERMIT_TTL_SECS))
    PORT: Any = field(default_factory=partial(copy.copy, settings.PORT))
    PRIVATE_PAYOUT_DOMAIN: Any = field(default_factory=partial(copy.copy, settings.PRIVATE_PAYOUT_DOMAIN))
    PRIVATE_REFUND_DOMAIN: Any = field(default_factory=partial(copy.copy, settings.PRIVATE_REFUND_DOMAIN))
    RECEIVER_NODE_LEASE_RENEW_INTERVAL: Any = field(default_factory=partial(copy.copy, settings.RECEIVER_NODE_LEASE_RENEW_INTERVAL))
    RECEIVER_NODE_WORK_TIMEOUT: Any = field(default_factory=partial(copy.copy, settings.RECEIVER_NODE_WORK_TIMEOUT))
    SERVICE_STARTED_AT: Any = field(default_factory=partial(copy.copy, settings.SERVICE_STARTED_AT))
    SOLANA_V1_TRANSACTION_SIZE_LIMIT: Any = field(default_factory=partial(copy.copy, settings.SOLANA_V1_TRANSACTION_SIZE_LIMIT))
    TCAP_CRANKER_TRANSITION_FIELDS: Any = field(default_factory=partial(copy.copy, settings.TCAP_CRANKER_TRANSITION_FIELDS))
    TCAP_PROGRAM_ID: Any = field(default_factory=partial(copy.copy, settings.TCAP_PROGRAM_ID))
    TCAP_PROOF_FIELDS: Any = field(default_factory=partial(copy.copy, settings.TCAP_PROOF_FIELDS))
    TERMINAL_INTENT_STATUSES: Any = field(default_factory=partial(copy.copy, settings.TERMINAL_INTENT_STATUSES))
    TINS_LOOKUP_SECRET: Any = field(default_factory=partial(copy.copy, settings.TINS_LOOKUP_SECRET))
    TINS_PROGRAM_ID: Any = field(default_factory=partial(copy.copy, settings.TINS_PROGRAM_ID))
    TINS_PROGRAM_SALT: Any = field(default_factory=partial(copy.copy, settings.TINS_PROGRAM_SALT))
    TOKEN_2022_PROGRAM_ID: Any = field(default_factory=partial(copy.copy, settings.TOKEN_2022_PROGRAM_ID))
    TOKEN_PROGRAM_ID: Any = field(default_factory=partial(copy.copy, settings.TOKEN_PROGRAM_ID))
    TSN_CANONICAL_DOMAIN_DISPLAY: Any = field(default_factory=partial(copy.copy, settings.TSN_CANONICAL_DOMAIN_DISPLAY))
    TSN_LOCAL_FLOW_LOGS: Any = field(default_factory=partial(copy.copy, settings.TSN_LOCAL_FLOW_LOGS))
    TSN_MOTHER_AUTHORITY_KEYPAIR_PATH: Any = field(default_factory=partial(copy.copy, settings.TSN_MOTHER_AUTHORITY_KEYPAIR_PATH))
    TSN_NODE_CLAIM_SLOT_HMAC_SECRET: Any = field(default_factory=partial(copy.copy, settings.TSN_NODE_CLAIM_SLOT_HMAC_SECRET))
    TSN_NODE_ID: Any = field(default_factory=partial(copy.copy, settings.TSN_NODE_ID))
    TSN_NODE_VERIFICATION_SIGNING_KEY: Any = field(default_factory=partial(copy.copy, settings.TSN_NODE_VERIFICATION_SIGNING_KEY))
    TSN_PROGRAM_ID: Any = field(default_factory=partial(copy.copy, settings.TSN_PROGRAM_ID))
    TSN_RECEIVER_FALLBACK_URL: Any = field(default_factory=partial(copy.copy, settings.TSN_RECEIVER_FALLBACK_URL))
    TSN_RECEIVER_NODE_API_KEY: Any = field(default_factory=partial(copy.copy, settings.TSN_RECEIVER_NODE_API_KEY))
    TSN_RECEIVER_URL: Any = field(default_factory=partial(copy.copy, settings.TSN_RECEIVER_URL))
    TSN_ROUTE_ATTESTATION_SIGNING_KEY: Any = field(default_factory=partial(copy.copy, settings.TSN_ROUTE_ATTESTATION_SIGNING_KEY))
    TSN_RPC_GATEWAY_URL: Any = field(default_factory=partial(copy.copy, settings.TSN_RPC_GATEWAY_URL))
    TSN_SETTLEMENT_AUTHORIZATION_SIGNING_KEY: Any = field(default_factory=partial(copy.copy, settings.TSN_SETTLEMENT_AUTHORIZATION_SIGNING_KEY))
    TSN_SOLANA_RPC_URL: Any = field(default_factory=partial(copy.copy, settings.TSN_SOLANA_RPC_URL))
    TSN_SOLANA_RPC_URLS: Any = field(default_factory=partial(copy.copy, settings.TSN_SOLANA_RPC_URLS))
    TSN_THRESHOLD_NONCE_SIGNING_KEY: Any = field(default_factory=partial(copy.copy, settings.TSN_THRESHOLD_NONCE_SIGNING_KEY))
    VAULT_LIQUIDITY_REFRESH_SECS: Any = field(default_factory=partial(copy.copy, settings.VAULT_LIQUIDITY_REFRESH_SECS))
    logger: Any = field(default_factory=partial(copy.copy, settings.logger))
    _store: Any = None
    _vault_liquidity_cache: Any = None
    _receiver_wake_event: Any = None
    _private_coordination_pending: bool = False
    _vault_liquidity_lock: Any = field(default_factory=asyncio.Lock)

    AESGCM = AESGCM
    Any = Any
    ApiPath = ApiPath
    BN254_SCALAR_MODULUS = BN254_SCALAR_MODULUS
    BadSignatureError = BadSignatureError
    BaseModel = BaseModel
    Box = Box
    CORSMiddleware = CORSMiddleware
    ConfigDict = ConfigDict
    CryptoError = CryptoError
    Curve25519PublicKey = Curve25519PublicKey
    Decimal = Decimal
    Depends = Depends
    FUNDING_ROOT_CHANGED = FUNDING_ROOT_CHANGED
    FUNDING_ROOT_INVALID = FUNDING_ROOT_INVALID
    FastAPI = FastAPI
    Field = Field
    HTTPException = HTTPException
    Header = Header
    HiddenHeadWitnessStore = HiddenHeadWitnessStore
    InvalidOperation = InvalidOperation
    InvalidTag = InvalidTag
    JSONResponse = JSONResponse
    Literal = Literal
    Optional = Optional
    PUBLIC_SIGNALS = PUBLIC_SIGNALS
    Path = Path
    PrivateCreditWait = PrivateCreditWait
    PrivateKey = PrivateKey
    Pubkey = Pubkey
    Query = Query
    ReceiverStore = ReceiverStore
    Request = Request
    RequestValidationError = RequestValidationError
    SigningKey = SigningKey
    ThresholdAccessError = staticmethod(ThresholdAccessError)
    ValidationError = ValidationError
    VerifyKey = VerifyKey
    asynccontextmanager = asynccontextmanager
    asyncio = asyncio
    base64 = base64
    binascii = binascii
    build_epoch_witness = staticmethod(build_epoch_witness)
    canonical_route_amount = staticmethod(canonical_route_amount)
    canonical_route_message = staticmethod(canonical_route_message)
    create_signed_nonce_receipt = staticmethod(create_signed_nonce_receipt)
    credit_amount_commitment = staticmethod(credit_amount_commitment)
    datetime = datetime
    derive_node_record_shared_point = staticmethod(derive_node_record_shared_point)
    encrypt_transaction_record_v1 = staticmethod(encrypt_transaction_record_v1)
    ensure_funding_snapshot = staticmethod(ensure_funding_snapshot)
    ensure_tip_snapshot = staticmethod(ensure_tip_snapshot)
    epoch_credits = staticmethod(epoch_credits)
    funding_membership = staticmethod(funding_membership)
    funding_nullifier = staticmethod(funding_nullifier)
    funding_root_address = staticmethod(funding_root_address)
    glob = glob
    hashlib = hashlib
    hex_field = staticmethod(hex_field)
    hmac = hmac
    httpx = httpx
    json = json
    load_dotenv = load_dotenv
    logging = logging
    math = math
    nonce_storage_key = staticmethod(nonce_storage_key)
    os = os
    prove_hidden_head_credit = staticmethod(prove_hidden_head_credit)
    prove_epoch = staticmethod(prove_epoch)
    re = re
    read_epoch = staticmethod(read_epoch)
    read_funding_root = staticmethod(read_funding_root)
    read_opening = staticmethod(read_opening)
    ready_destination_networks = staticmethod(ready_destination_networks)
    request_validation_exception_handler = request_validation_exception_handler
    secrets = secrets
    select_funding_root = staticmethod(select_funding_root)
    sign_route_message = staticmethod(sign_route_message)
    struct = struct
    threshold_request_commitment = staticmethod(threshold_request_commitment)
    time = time
    timezone = timezone
    uuid4 = uuid4
    uvicorn = uvicorn
    validate_funding_note = staticmethod(validate_funding_note)
    validate_transaction_record_v1 = staticmethod(validate_transaction_record_v1)
    verify_destination_route = staticmethod(verify_destination_route)
    verify_threshold_access_request = staticmethod(verify_threshold_access_request)
    FirebaseStore = FirebaseStore
    FileStore = FileStore
    CreateIntentRequest = CreateIntentRequest
    MempoolIntent = MempoolIntent
    PublicMempoolIntent = PublicMempoolIntent
    SignedLeasePermitRequest = SignedLeasePermitRequest
    IntentWorkItem = IntentWorkItem
    UpdateStatusRequest = UpdateStatusRequest
    CrankerHeartbeatRequest = CrankerHeartbeatRequest
    CrankerHeartbeatRecord = CrankerHeartbeatRecord
    EpochStatus = EpochStatus
    EpochCloseResult = EpochCloseResult
    MempoolStatusRequest = MempoolStatusRequest
    MempoolStatusResponse = MempoolStatusResponse
    IntentToSettlementMetrics = IntentToSettlementMetrics
    UptimeMetrics = UptimeMetrics
    MetricsResponse = MetricsResponse
    TokenNetworkStatus = TokenNetworkStatus
    NetworkOverviewResponse = NetworkOverviewResponse
    clean_env = staticmethod(clean_env)
    receiver_endpoints = receiver_endpoints
    receiver_request = receiver_request
    get_supported_token_mints = get_supported_token_mints
    get_supported_token_metadata = get_supported_token_metadata
    resolve_tcap_registered_asset = resolve_tcap_registered_asset
    parse_optional_float = staticmethod(parse_optional_float)
    ui_amount_to_base_units = staticmethod(ui_amount_to_base_units)
    encode_base58 = encode_base58
    decode_base58 = decode_base58
    decode_secret_key = staticmethod(decode_secret_key)
    get_program_pubkey = get_program_pubkey
    find_tsn_pda = find_tsn_pda
    get_mother_escrow_pda = get_mother_escrow_pda
    get_epoch_treasury_pda = get_epoch_treasury_pda
    get_epoch_ledger_pda = get_epoch_ledger_pda
    get_epoch_claim_slot_pda = get_epoch_claim_slot_pda
    get_settlement_dna_pda = get_settlement_dna_pda
    derive_claim_slot = derive_claim_slot
    get_cranker_pda = get_cranker_pda
    get_cranker_vault_pda = get_cranker_vault_pda
    get_cranker_vault_token_pda = get_cranker_vault_token_pda
    get_associated_token_address = get_associated_token_address
    get_settlement_authorization_signing_key = get_settlement_authorization_signing_key
    _stable_verification_json = _stable_verification_json
    _node_verification_signing_key = _node_verification_signing_key
    _node_verification_message = staticmethod(_node_verification_message)
    _public_coordination = staticmethod(_public_coordination)
    _sign_node_verification = _sign_node_verification
    settlement_authorization_signer_pubkey = settlement_authorization_signer_pubkey
    require_worker_api_key = require_worker_api_key
    lease_authorization_message = lease_authorization_message
    lease_id_hash = staticmethod(lease_id_hash)
    verify_lease_authorization = verify_lease_authorization
    decrypt_settlement_token = decrypt_settlement_token
    private_payout_permit_message = private_payout_permit_message
    get_store = get_store
    get_mempool_store = get_mempool_store
    k_intents = k_intents
    k_epoch = k_epoch
    k_crankers = k_crankers
    k_tin_operation_nonces = k_tin_operation_nonces
    k_canonical_message_nonces = k_canonical_message_nonces
    k_threshold_access_nonces = k_threshold_access_nonces
    k_recipient_route_binding = k_recipient_route_binding
    hget_all_json = hget_all_json
    write_recipient_route_binding = write_recipient_route_binding
    private_settlement_commitment = staticmethod(private_settlement_commitment)
    read_recipient_route_binding = read_recipient_route_binding
    read_epoch_state = read_epoch_state
    parse_iso = staticmethod(parse_iso)
    next_close_for_state = next_close_for_state
    is_epoch_due = is_epoch_due
    build_epoch_status = build_epoch_status
    get_token_account_balance_ui = get_token_account_balance_ui
    solana_rpc = solana_rpc
    get_tins_program_pubkey = get_tins_program_pubkey
    get_private_tin_pda = get_private_tin_pda
    decode_private_tin_route_material = staticmethod(decode_private_tin_route_material)
    resolve_tin_identity_for_verification = resolve_tin_identity_for_verification
    read_tins_account_data = read_tins_account_data
    read_onchain_tin_tip_route = read_onchain_tin_tip_route
    get_program_accounts = get_program_accounts
    read_onchain_cranker_vaults = read_onchain_cranker_vaults
    read_public_vault_liquidity = read_public_vault_liquidity
    read_public_vault_liquidity_cached = read_public_vault_liquidity_cached
    public_intent = staticmethod(public_intent)
    _field = staticmethod(_field)
    _require_string = _require_string
    _decode_hash32 = staticmethod(_decode_hash32)
    _canonical_tin_owner_intent_message = staticmethod(_canonical_tin_owner_intent_message)
    _decode_base64_blob = staticmethod(_decode_base64_blob)
    _decode_owner_pubkey = _decode_owner_pubkey
    _expiry_from_input = staticmethod(_expiry_from_input)
    _sha256_hex_utf8 = staticmethod(_sha256_hex_utf8)
    _encode_signed_i64_le = staticmethod(_encode_signed_i64_le)
    _encode_u32_le = staticmethod(_encode_u32_le)
    _build_canonical_message = _build_canonical_message
    _parse_canonical_message = _parse_canonical_message
    _parse_usdc_base_units = staticmethod(_parse_usdc_base_units)
    _parse_canonical_expiry = staticmethod(_parse_canonical_expiry)
    _assert_canonical_nonce_unused = _assert_canonical_nonce_unused
    _assert_recipient_hash_matches_owner = staticmethod(_assert_recipient_hash_matches_owner)
    _verify_payment_authorization_from_signed_message = _verify_payment_authorization_from_signed_message
    _normalize_tin_operation_input = _normalize_tin_operation_input
    _decode_base64_signature = staticmethod(_decode_base64_signature)
    _verify_ed25519_signature = _verify_ed25519_signature
    assert_tin_operation_can_enter = assert_tin_operation_can_enter
    commit_epoch_to_github = commit_epoch_to_github
    close_epoch_task = close_epoch_task
    _tcap_credit_bytes32 = staticmethod(_tcap_credit_bytes32)
    _tcap_credit_u64 = staticmethod(_tcap_credit_u64)
    _read_tcap_shared_replay_root = _read_tcap_shared_replay_root
    _validate_tcap_credit_digest = _validate_tcap_credit_digest
    _simulate_owner_signed_tcap_deposit = _simulate_owner_signed_tcap_deposit
    _read_solana_shortvec = staticmethod(_read_solana_shortvec)
    _parse_solana_v1_message = staticmethod(_parse_solana_v1_message)
    _mother_authority_signing_key = _mother_authority_signing_key
    _assert_mother_authority_key_matches_chain = _assert_mother_authority_key_matches_chain
    _verify_mother_signed_tcap_settlement_message = _verify_mother_signed_tcap_settlement_message
    _parse_signed_tcap_deposit_instructions = _parse_signed_tcap_deposit_instructions
    _select_tcap_private_funding_deposit = _select_tcap_private_funding_deposit
    _verify_signed_tcap_deposit_contract = _verify_signed_tcap_deposit_contract
    _verify_confirmed_tcap_deposit = _verify_confirmed_tcap_deposit
    _assert_tcap_gpru_credit_program_preconditions = _assert_tcap_gpru_credit_program_preconditions
    _public_tcap_transition = _public_tcap_transition
    _tcap_credit_v1_wire_size = staticmethod(_tcap_credit_v1_wire_size)
    _assert_tcap_credit_transport_capacity = _assert_tcap_credit_transport_capacity
    _read_gpru_proof_accounts = _read_gpru_proof_accounts
    _settlement_funding_context = _settlement_funding_context
    _current_credit_epoch = _current_credit_epoch
    _coordinate_private_credit_work = _coordinate_private_credit_work
    _verify_private_coordination_work = _verify_private_coordination_work
    _construct_verified_tcap_transition = _construct_verified_tcap_transition
    _assert_stored_settlement_attestation = _assert_stored_settlement_attestation
    _assert_current_settlement_lease = staticmethod(_assert_current_settlement_lease)
    _verify_receiver_work = _verify_receiver_work
    _renew_receiver_node_lease = _renew_receiver_node_lease
    _verify_and_report_receiver_work = _verify_and_report_receiver_work
    _process_receiver_work_with_lease = _process_receiver_work_with_lease
    receiver_verification_worker = receiver_verification_worker
    _receiver_work_by_id = _receiver_work_by_id
    _receiver_verified_payload = staticmethod(_receiver_verified_payload)
    lifespan = lifespan
    wake_receiver_verification = wake_receiver_verification
    _verification_rejection_reason = staticmethod(_verification_rejection_reason)
    private_payment_validation_error = staticmethod(private_payment_validation_error)
    _assert_authorized_credit_preconditions = _assert_authorized_credit_preconditions
    _authorize_private_coordination = _authorize_private_coordination
    _verify_private_coordination_message = _verify_private_coordination_message
    create_settlement_authorization = create_settlement_authorization
    _assert_unsigned_native_settlement = staticmethod(_assert_unsigned_native_settlement)
    _native_blockhash_lifetime = staticmethod(_native_blockhash_lifetime)
    sign_settlement_transaction = sign_settlement_transaction
    mempool_status = mempool_status
    consume_threshold_access_nonce = consume_threshold_access_nonce
    prepare_tin_debit_request = prepare_tin_debit_request
    post_tin_debit = post_tin_debit
    post_intent = post_intent
    get_network_recent_blockhash = get_network_recent_blockhash
    post_funding_readiness = post_funding_readiness
    post_complete_funding = post_complete_funding
    list_intents = list_intents
    update_intent_status = update_intent_status
    list_pending_intent_work = list_pending_intent_work
    get_metrics = get_metrics
    post_cranker_heartbeat = post_cranker_heartbeat
    get_settlement_networks = get_settlement_networks
    get_network_overview = get_network_overview
    get_epoch_status = get_epoch_status
    close_epoch = close_epoch
