"""TSN Node composition and stable integration entry point.

Component implementations live in functional packages. This module only builds
the runtime, registers the existing HTTP contract, and exposes supported helpers.
"""
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
from pydantic import BaseModel
from pydantic import ConfigDict
from pydantic import Field
from pydantic import ValidationError
from tip_snapshot_sync import ensure_tip_snapshot
from typing import Any
from typing import Literal
from typing import Optional
from uuid import uuid4
import asyncio
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
from core.runtime import NodeRuntime

runtime = NodeRuntime()
ALLOW_DIRECT_FIREBASE_STORE = runtime.ALLOW_DIRECT_FIREBASE_STORE
ALLOW_LOCAL_JSON_STORE = runtime.ALLOW_LOCAL_JSON_STORE
ASSOCIATED_TOKEN_PROGRAM_ID = runtime.ASSOCIATED_TOKEN_PROGRAM_ID
BASE58_ALPHABET = runtime.BASE58_ALPHABET
CRANKER_HEARTBEAT_TTL_SECS = runtime.CRANKER_HEARTBEAT_TTL_SECS
CRANKER_VAULT_ACCOUNT_SIZE = runtime.CRANKER_VAULT_ACCOUNT_SIZE
CRANKER_VAULT_DISCRIMINATOR = runtime.CRANKER_VAULT_DISCRIMINATOR
DEVNET_USDC_MINT = runtime.DEVNET_USDC_MINT
EPOCH_HOURS = runtime.EPOCH_HOURS
EPOCH_SECS = runtime.EPOCH_SECS
FIREBASE_COLLECTION = runtime.FIREBASE_COLLECTION
GITHUB_API = runtime.GITHUB_API
GITHUB_REPO = runtime.GITHUB_REPO
GPRU_PROGRAM_ID = runtime.GPRU_PROGRAM_ID
HOST = runtime.HOST
LEASE_AUTH_MAX_AGE_SECS = runtime.LEASE_AUTH_MAX_AGE_SECS
MEMPOOL_API_KEY = runtime.MEMPOOL_API_KEY
MEMPOOL_FILE = runtime.MEMPOOL_FILE
MEMPOOL_LEASE_DOMAIN = runtime.MEMPOOL_LEASE_DOMAIN
MEMPOOL_NS = runtime.MEMPOOL_NS
MEMPOOL_STORE = runtime.MEMPOOL_STORE
PERMIT_TTL_SECS = runtime.PERMIT_TTL_SECS
PORT = runtime.PORT
PRIVATE_PAYOUT_DOMAIN = runtime.PRIVATE_PAYOUT_DOMAIN
PRIVATE_REFUND_DOMAIN = runtime.PRIVATE_REFUND_DOMAIN
RECEIVER_NODE_LEASE_RENEW_INTERVAL = runtime.RECEIVER_NODE_LEASE_RENEW_INTERVAL
RECEIVER_NODE_WORK_TIMEOUT = runtime.RECEIVER_NODE_WORK_TIMEOUT
SERVICE_STARTED_AT = runtime.SERVICE_STARTED_AT
SOLANA_V1_TRANSACTION_SIZE_LIMIT = runtime.SOLANA_V1_TRANSACTION_SIZE_LIMIT
TCAP_CRANKER_TRANSITION_FIELDS = runtime.TCAP_CRANKER_TRANSITION_FIELDS
TCAP_PROGRAM_ID = runtime.TCAP_PROGRAM_ID
TCAP_PROOF_FIELDS = runtime.TCAP_PROOF_FIELDS
TERMINAL_INTENT_STATUSES = runtime.TERMINAL_INTENT_STATUSES
TINS_LOOKUP_SECRET = runtime.TINS_LOOKUP_SECRET
TINS_PROGRAM_ID = runtime.TINS_PROGRAM_ID
TINS_PROGRAM_SALT = runtime.TINS_PROGRAM_SALT
TOKEN_2022_PROGRAM_ID = runtime.TOKEN_2022_PROGRAM_ID
TOKEN_PROGRAM_ID = runtime.TOKEN_PROGRAM_ID
TSN_CANONICAL_DOMAIN_DISPLAY = runtime.TSN_CANONICAL_DOMAIN_DISPLAY
TSN_LOCAL_FLOW_LOGS = runtime.TSN_LOCAL_FLOW_LOGS
TSN_MOTHER_AUTHORITY_KEYPAIR_PATH = runtime.TSN_MOTHER_AUTHORITY_KEYPAIR_PATH
TSN_NODE_CLAIM_SLOT_HMAC_SECRET = runtime.TSN_NODE_CLAIM_SLOT_HMAC_SECRET
TSN_NODE_ID = runtime.TSN_NODE_ID
TSN_NODE_VERIFICATION_SIGNING_KEY = runtime.TSN_NODE_VERIFICATION_SIGNING_KEY
TSN_PROGRAM_ID = runtime.TSN_PROGRAM_ID
TSN_RECEIVER_FALLBACK_URL = runtime.TSN_RECEIVER_FALLBACK_URL
TSN_RECEIVER_NODE_API_KEY = runtime.TSN_RECEIVER_NODE_API_KEY
TSN_RECEIVER_URL = runtime.TSN_RECEIVER_URL
TSN_ROUTE_ATTESTATION_SIGNING_KEY = runtime.TSN_ROUTE_ATTESTATION_SIGNING_KEY
TSN_RPC_GATEWAY_URL = runtime.TSN_RPC_GATEWAY_URL
TSN_SETTLEMENT_AUTHORIZATION_SIGNING_KEY = runtime.TSN_SETTLEMENT_AUTHORIZATION_SIGNING_KEY
TSN_SOLANA_RPC_URL = runtime.TSN_SOLANA_RPC_URL
TSN_SOLANA_RPC_URLS = runtime.TSN_SOLANA_RPC_URLS
TSN_THRESHOLD_NONCE_SIGNING_KEY = runtime.TSN_THRESHOLD_NONCE_SIGNING_KEY
VAULT_LIQUIDITY_REFRESH_SECS = runtime.VAULT_LIQUIDITY_REFRESH_SECS
logger = runtime.logger
clean_env = runtime.clean_env
receiver_endpoints = runtime.receiver_endpoints
receiver_request = runtime.receiver_request
get_supported_token_mints = runtime.get_supported_token_mints
get_supported_token_metadata = runtime.get_supported_token_metadata
resolve_tcap_registered_asset = runtime.resolve_tcap_registered_asset
parse_optional_float = runtime.parse_optional_float
ui_amount_to_base_units = runtime.ui_amount_to_base_units
encode_base58 = runtime.encode_base58
decode_base58 = runtime.decode_base58
decode_secret_key = runtime.decode_secret_key
get_program_pubkey = runtime.get_program_pubkey
find_tsn_pda = runtime.find_tsn_pda
get_mother_escrow_pda = runtime.get_mother_escrow_pda
get_epoch_treasury_pda = runtime.get_epoch_treasury_pda
get_epoch_ledger_pda = runtime.get_epoch_ledger_pda
get_epoch_claim_slot_pda = runtime.get_epoch_claim_slot_pda
get_settlement_dna_pda = runtime.get_settlement_dna_pda
derive_claim_slot = runtime.derive_claim_slot
get_cranker_pda = runtime.get_cranker_pda
get_cranker_vault_pda = runtime.get_cranker_vault_pda
get_cranker_vault_token_pda = runtime.get_cranker_vault_token_pda
get_associated_token_address = runtime.get_associated_token_address
get_settlement_authorization_signing_key = runtime.get_settlement_authorization_signing_key
_stable_verification_json = runtime._stable_verification_json
_node_verification_signing_key = runtime._node_verification_signing_key
_node_verification_message = runtime._node_verification_message
_public_coordination = runtime._public_coordination
_sign_node_verification = runtime._sign_node_verification
settlement_authorization_signer_pubkey = runtime.settlement_authorization_signer_pubkey
require_worker_api_key = runtime.require_worker_api_key
lease_authorization_message = runtime.lease_authorization_message
lease_id_hash = runtime.lease_id_hash
verify_lease_authorization = runtime.verify_lease_authorization
decrypt_settlement_token = runtime.decrypt_settlement_token
private_payout_permit_message = runtime.private_payout_permit_message
get_store = runtime.get_store
get_mempool_store = runtime.get_mempool_store
k_intents = runtime.k_intents
k_epoch = runtime.k_epoch
k_crankers = runtime.k_crankers
k_tin_operation_nonces = runtime.k_tin_operation_nonces
k_canonical_message_nonces = runtime.k_canonical_message_nonces
k_threshold_access_nonces = runtime.k_threshold_access_nonces
k_recipient_route_binding = runtime.k_recipient_route_binding
hget_all_json = runtime.hget_all_json
write_recipient_route_binding = runtime.write_recipient_route_binding
private_settlement_commitment = runtime.private_settlement_commitment
read_recipient_route_binding = runtime.read_recipient_route_binding
read_epoch_state = runtime.read_epoch_state
parse_iso = runtime.parse_iso
next_close_for_state = runtime.next_close_for_state
is_epoch_due = runtime.is_epoch_due
build_epoch_status = runtime.build_epoch_status
get_token_account_balance_ui = runtime.get_token_account_balance_ui
solana_rpc = runtime.solana_rpc
get_tins_program_pubkey = runtime.get_tins_program_pubkey
get_private_tin_pda = runtime.get_private_tin_pda
decode_private_tin_route_material = runtime.decode_private_tin_route_material
resolve_tin_identity_for_verification = runtime.resolve_tin_identity_for_verification
read_tins_account_data = runtime.read_tins_account_data
read_onchain_tin_tip_route = runtime.read_onchain_tin_tip_route
get_program_accounts = runtime.get_program_accounts
read_onchain_cranker_vaults = runtime.read_onchain_cranker_vaults
read_public_vault_liquidity = runtime.read_public_vault_liquidity
read_public_vault_liquidity_cached = runtime.read_public_vault_liquidity_cached
public_intent = runtime.public_intent
_field = runtime._field
_require_string = runtime._require_string
_decode_hash32 = runtime._decode_hash32
_canonical_tin_owner_intent_message = runtime._canonical_tin_owner_intent_message
_decode_base64_blob = runtime._decode_base64_blob
_decode_owner_pubkey = runtime._decode_owner_pubkey
_expiry_from_input = runtime._expiry_from_input
_sha256_hex_utf8 = runtime._sha256_hex_utf8
_encode_signed_i64_le = runtime._encode_signed_i64_le
_encode_u32_le = runtime._encode_u32_le
_build_canonical_message = runtime._build_canonical_message
_parse_canonical_message = runtime._parse_canonical_message
_parse_usdc_base_units = runtime._parse_usdc_base_units
_parse_canonical_expiry = runtime._parse_canonical_expiry
_assert_canonical_nonce_unused = runtime._assert_canonical_nonce_unused
_assert_recipient_hash_matches_owner = runtime._assert_recipient_hash_matches_owner
_verify_payment_authorization_from_signed_message = runtime._verify_payment_authorization_from_signed_message
_normalize_tin_operation_input = runtime._normalize_tin_operation_input
_decode_base64_signature = runtime._decode_base64_signature
_verify_ed25519_signature = runtime._verify_ed25519_signature
assert_tin_operation_can_enter = runtime.assert_tin_operation_can_enter
commit_epoch_to_github = runtime.commit_epoch_to_github
close_epoch_task = runtime.close_epoch_task
_tcap_credit_bytes32 = runtime._tcap_credit_bytes32
_tcap_credit_u64 = runtime._tcap_credit_u64
_read_tcap_shared_replay_root = runtime._read_tcap_shared_replay_root
_validate_tcap_credit_digest = runtime._validate_tcap_credit_digest
_simulate_owner_signed_tcap_deposit = runtime._simulate_owner_signed_tcap_deposit
_read_solana_shortvec = runtime._read_solana_shortvec
_parse_solana_v1_message = runtime._parse_solana_v1_message
_mother_authority_signing_key = runtime._mother_authority_signing_key
_assert_mother_authority_key_matches_chain = runtime._assert_mother_authority_key_matches_chain
_verify_mother_signed_tcap_settlement_message = runtime._verify_mother_signed_tcap_settlement_message
_parse_signed_tcap_deposit_instructions = runtime._parse_signed_tcap_deposit_instructions
_select_tcap_private_funding_deposit = runtime._select_tcap_private_funding_deposit
_verify_signed_tcap_deposit_contract = runtime._verify_signed_tcap_deposit_contract
_verify_confirmed_tcap_deposit = runtime._verify_confirmed_tcap_deposit
_assert_tcap_gpru_credit_program_preconditions = runtime._assert_tcap_gpru_credit_program_preconditions
_public_tcap_transition = runtime._public_tcap_transition
_tcap_credit_v1_wire_size = runtime._tcap_credit_v1_wire_size
_assert_tcap_credit_transport_capacity = runtime._assert_tcap_credit_transport_capacity
_read_gpru_proof_accounts = runtime._read_gpru_proof_accounts
_settlement_funding_context = runtime._settlement_funding_context
_current_credit_epoch = runtime._current_credit_epoch
_coordinate_private_credit_work = runtime._coordinate_private_credit_work
_verify_private_coordination_work = runtime._verify_private_coordination_work
_construct_verified_tcap_transition = runtime._construct_verified_tcap_transition
_assert_stored_settlement_attestation = runtime._assert_stored_settlement_attestation
_assert_current_settlement_lease = runtime._assert_current_settlement_lease
_verify_receiver_work = runtime._verify_receiver_work
_renew_receiver_node_lease = runtime._renew_receiver_node_lease
_verify_and_report_receiver_work = runtime._verify_and_report_receiver_work
_process_receiver_work_with_lease = runtime._process_receiver_work_with_lease
receiver_verification_worker = runtime.receiver_verification_worker
_receiver_work_by_id = runtime._receiver_work_by_id
_receiver_verified_payload = runtime._receiver_verified_payload
lifespan = runtime.lifespan
wake_receiver_verification = runtime.wake_receiver_verification
_verification_rejection_reason = runtime._verification_rejection_reason
private_payment_validation_error = runtime.private_payment_validation_error
_assert_authorized_credit_preconditions = runtime._assert_authorized_credit_preconditions
_authorize_private_coordination = runtime._authorize_private_coordination
_verify_private_coordination_message = runtime._verify_private_coordination_message
create_settlement_authorization = runtime.create_settlement_authorization
_assert_unsigned_native_settlement = runtime._assert_unsigned_native_settlement
_native_blockhash_lifetime = runtime._native_blockhash_lifetime
sign_settlement_transaction = runtime.sign_settlement_transaction
mempool_status = runtime.mempool_status
consume_threshold_access_nonce = runtime.consume_threshold_access_nonce
prepare_tin_debit_request = runtime.prepare_tin_debit_request
post_tin_debit = runtime.post_tin_debit
post_intent = runtime.post_intent
get_network_recent_blockhash = runtime.get_network_recent_blockhash
post_funding_readiness = runtime.post_funding_readiness
post_complete_funding = runtime.post_complete_funding
list_intents = runtime.list_intents
update_intent_status = runtime.update_intent_status
list_pending_intent_work = runtime.list_pending_intent_work
get_metrics = runtime.get_metrics
post_cranker_heartbeat = runtime.post_cranker_heartbeat
get_settlement_networks = runtime.get_settlement_networks
get_network_overview = runtime.get_network_overview
get_epoch_status = runtime.get_epoch_status
close_epoch = runtime.close_epoch
FirebaseStore = runtime.FirebaseStore
FileStore = runtime.FileStore
CreateIntentRequest = runtime.CreateIntentRequest
MempoolIntent = runtime.MempoolIntent
PublicMempoolIntent = runtime.PublicMempoolIntent
SignedLeasePermitRequest = runtime.SignedLeasePermitRequest
IntentWorkItem = runtime.IntentWorkItem
UpdateStatusRequest = runtime.UpdateStatusRequest
CrankerHeartbeatRequest = runtime.CrankerHeartbeatRequest
CrankerHeartbeatRecord = runtime.CrankerHeartbeatRecord
EpochStatus = runtime.EpochStatus
EpochCloseResult = runtime.EpochCloseResult
MempoolStatusRequest = runtime.MempoolStatusRequest
MempoolStatusResponse = runtime.MempoolStatusResponse
IntentToSettlementMetrics = runtime.IntentToSettlementMetrics
UptimeMetrics = runtime.UptimeMetrics
MetricsResponse = runtime.MetricsResponse
TokenNetworkStatus = runtime.TokenNetworkStatus
NetworkOverviewResponse = runtime.NetworkOverviewResponse

app = FastAPI(
    title="TSN Mempool",
    description=(
        "Shared off-chain settlement queue for the Transfer Settlement Network. "
        f"Epoch every {EPOCH_HOURS}h â€” archives to GitHub (bigdreamsweb3/tsn-epoch-records)."
    ),
    version="1.0.0",
    lifespan=lifespan,
)

app.post('/internal/wake', dependencies=[Depends(require_worker_api_key)])(wake_receiver_verification)
app.exception_handler(RequestValidationError)(private_payment_validation_error)
app.post('/internal/settlement-authorizations/settlement', dependencies=[Depends(require_worker_api_key)])(create_settlement_authorization)
app.post('/internal/settlement-authorizations/signature', dependencies=[Depends(require_worker_api_key)])(sign_settlement_transaction)
app.post('/', response_model=MempoolStatusResponse)(mempool_status)
app.post('/threshold-access/nonces/consume')(consume_threshold_access_nonce)
app.post('/intents', response_model=PublicMempoolIntent)(post_intent)
app.post('/network/tin-debit/prepare')(prepare_tin_debit_request)
app.post('/network/tin-debit')(post_tin_debit)
app.get('/network/recent-blockhash')(get_network_recent_blockhash)
app.post('/network/funding/readiness')(post_funding_readiness)
app.post('/network/funding/complete')(post_complete_funding)
app.get('/intents', response_model=list[PublicMempoolIntent], dependencies=[Depends(require_worker_api_key)])(list_intents)
app.patch('/intents/{intent_id}/status', response_model=MempoolIntent, dependencies=[Depends(require_worker_api_key)])(update_intent_status)
app.get('/intent-work', response_model=list[IntentWorkItem], dependencies=[Depends(require_worker_api_key)])(list_pending_intent_work)
app.get('/metrics', response_model=MetricsResponse)(get_metrics)
app.post('/crankers/heartbeat', response_model=CrankerHeartbeatRecord, dependencies=[Depends(require_worker_api_key)])(post_cranker_heartbeat)
app.get('/settlement-networks')(get_settlement_networks)
app.get('/network/overview', response_model=NetworkOverviewResponse)(get_network_overview)
app.get('/epoch/status', response_model=EpochStatus)(get_epoch_status)
app.post('/epoch/close', response_model=EpochCloseResult, dependencies=[Depends(require_worker_api_key)])(close_epoch)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        origin.strip()
        for origin in os.environ.get(
            "TSN_NODE_ALLOWED_ORIGINS",
            "http://127.0.0.1:8010,http://localhost:8010",
        ).split(",")
        if origin.strip()
    ],
    allow_methods=["*"],
    allow_headers=["*"],
)

if __name__ == "__main__":
    uvicorn.run("server:app", host=HOST, port=PORT, reload=False)
