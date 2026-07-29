from __future__ import annotations

import base64
import binascii
import hashlib
import json
import re
import secrets
import struct
import time
from datetime import datetime, timezone
from typing import Any, Literal, Optional

from fastapi import Header, HTTPException
from nacl.exceptions import BadSignatureError, CryptoError
from nacl.public import Box, PrivateKey, PublicKey as Curve25519PublicKey, SealedBox
from nacl.signing import VerifyKey
from solders.pubkey import Pubkey

from app import config
from app.schemas.payments import CreateIntentRequest
from app.schemas.tin import TinPruRouteSessionResponse
from app.solana import get_permit_signing_key
from app.store import (
    get_mempool_store,
    hget_all_json,
    k_canonical_message_nonces,
    k_tin_pru_route_nonces,
    k_tin_pru_route_sessions,
)
from app.utils.encoding import decode_base58, decode_secret_key, ui_amount_to_base_units


def require_worker_api_key(
    x_api_key: Optional[str] = Header(None, alias="x-api-key"),
) -> None:
    if config.MEMPOOL_API_KEY and not secrets.compare_digest(x_api_key or "", config.MEMPOOL_API_KEY):
        raise HTTPException(401, "Invalid TSN mempool API key")


def lease_authorization_message(
    action: Literal["payout", "recovery", "pru-spend"],
    work_id: str,
    operator_pubkey: str,
    requested_at_ts: int,
) -> bytes:
    return "|".join(
        [config.MEMPOOL_LEASE_DOMAIN, action, work_id, operator_pubkey, str(requested_at_ts)]
    ).encode()


def verify_lease_authorization(
    action: Literal["payout", "recovery", "pru-spend"],
    work_id: str,
    operator_pubkey: str,
    requested_at_ts: int,
    signature_base64: str,
) -> Pubkey:
    now = int(time.time())
    if abs(now - requested_at_ts) > config.LEASE_AUTH_MAX_AGE_SECS:
        raise HTTPException(401, "Cranker lease authorization expired")
    try:
        operator = Pubkey.from_string(operator_pubkey)
        signature = base64.b64decode(signature_base64, validate=True)
        VerifyKey(bytes(operator)).verify(
            lease_authorization_message(action, work_id, operator_pubkey, requested_at_ts),
            signature,
        )
    except (ValueError, BadSignatureError, binascii.Error) as exc:
        raise HTTPException(401, "Invalid Cranker lease authorization") from exc
    return operator


def decrypt_settlement_token(encrypted: dict[str, Any]) -> dict[str, Any]:
    try:
        secret = decode_secret_key(
            config.TSN_ROUTE_ENCRYPTION_SECRET_KEY,
            {32},
            "TSN_ROUTE_ENCRYPTION_SECRET_KEY",
        )
        nonce = base64.b64decode(str(encrypted["nonceBase64"]), validate=True)
        ephemeral = base64.b64decode(str(encrypted["ephemeralPublicKeyBase64"]), validate=True)
        ciphertext = base64.b64decode(str(encrypted["ciphertextBase64"]), validate=True)
        plaintext = Box(
            PrivateKey(secret),
            Curve25519PublicKey(ephemeral),
        ).decrypt(ciphertext, nonce)
        return json.loads(plaintext.decode("utf-8"))
    except (KeyError, ValueError, binascii.Error, CryptoError, json.JSONDecodeError) as exc:
        raise HTTPException(422, "encryptedSettlementToken is invalid") from exc


def private_payout_permit_message(
    operator: Pubkey,
    payout_nullifier: bytes,
    payout_sequence: int,
    escrow_token_account: Pubkey,
    destination_token_account: Pubkey,
    token_mint: Pubkey,
    recipient_amount: int,
    fee_amount: int,
    expires_at_ts: int,
) -> bytes:
    return b"".join(
        [
            config.PRIVATE_PAYOUT_DOMAIN,
            bytes(operator),
            payout_nullifier,
            struct.pack("<Q", payout_sequence),
            bytes(escrow_token_account),
            bytes(destination_token_account),
            bytes(token_mint),
            struct.pack("<Q", recipient_amount),
            struct.pack("<Q", fee_amount),
            struct.pack("<q", expires_at_ts),
        ]
    )


def private_recovery_permit_message(
    operator: Pubkey,
    recovery_nullifier: bytes,
    recovery_sequence: int,
    escrow_token_account: Pubkey,
    settlement_cranker_vault: Pubkey,
    settlement_vault_token_account: Pubkey,
    token_mint: Pubkey,
    recovery_amount: int,
    expires_at_ts: int,
) -> bytes:
    return b"".join(
        [
            config.PRIVATE_RECOVERY_DOMAIN,
            bytes(operator),
            recovery_nullifier,
            struct.pack("<Q", recovery_sequence),
            bytes(escrow_token_account),
            bytes(settlement_cranker_vault),
            bytes(settlement_vault_token_account),
            bytes(token_mint),
            struct.pack("<Q", recovery_amount),
            struct.pack("<q", expires_at_ts),
        ]
    )


config.TSN_CANONICAL_DOMAIN_DISPLAY = "..." + hashlib.sha256(
    b"trustlink-pay:tsn:canonical-signing:v1"
).hexdigest()[-8:]


def _build_canonical_message(action: str, fields: list[tuple[str, str]]) -> str:
    return "\n".join(
        [f"TSN {action}", "---"]
        + [f"{label}: {value}" for label, value in fields]
        + [f"Domain: {config.TSN_CANONICAL_DOMAIN_DISPLAY}"]
    )


def _parse_canonical_message(message: str, expected_action: str) -> dict[str, str]:
    if not isinstance(message, str) or not message.startswith("TSN "):
        raise HTTPException(400, "signed message is not a canonical TSN message")
    lines = message.split("\n")
    if len(lines) < 4 or lines[0] != f"TSN {expected_action}" or lines[1] != "---":
        raise HTTPException(400, f"signed message must use the TSN {expected_action} template")
    parsed: dict[str, str] = {}
    for line in lines[2:]:
        if ": " not in line:
            raise HTTPException(400, f"canonical signed message field is malformed: {line}")
        label, value = line.split(": ", 1)
        if label in parsed:
            raise HTTPException(400, f"canonical signed message field is duplicated: {label}")
        parsed[label] = value
    if parsed.get("Domain") != config.TSN_CANONICAL_DOMAIN_DISPLAY:
        raise HTTPException(400, "canonical signed message domain does not match TSN")
    return parsed


def _parse_usdc_base_units(value: str, label: str) -> int:
    match = re.fullmatch(r"(\d+)(?:\.(\d{1,6}))? USDC", value)
    if not match:
        raise HTTPException(400, f"{label} must be a decimal USDC amount in the signed message")
    return int(match.group(1)) * 1_000_000 + int((match.group(2) or "").ljust(6, "0"))


def _parse_canonical_expiry(value: str) -> datetime:
    try:
        expires_at = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError as exc:
        raise HTTPException(400, "signed message expiry is not valid ISO 8601") from exc
    if expires_at <= datetime.now(timezone.utc):
        raise HTTPException(400, "signed message has expired")
    return expires_at


async def _assert_canonical_nonce_unused(*, action: str, nonce: str) -> None:
    key = hashlib.sha256(f"{action}|{nonce}".encode("utf-8")).hexdigest()
    store = await get_mempool_store()
    if await store.hget(k_canonical_message_nonces(), key):
        raise HTTPException(400, "signed message nonce has already been used")
    await store.hset(
        k_canonical_message_nonces(),
        key,
        json.dumps({"action": action, "nonce": nonce, "usedAt": datetime.now(timezone.utc).isoformat()}),
    )


def _decode_base64_signature(value: str) -> bytes:
    try:
        signature = base64.b64decode(value, validate=True)
    except (binascii.Error, ValueError) as exc:
        raise HTTPException(403, "signature is not valid base64") from exc
    if len(signature) != 64:
        raise HTTPException(403, "signature must be 64 bytes")
    return signature


def _verify_ed25519_signature(*, public_key: str, message: bytes, signature_base64: str) -> None:
    try:
        VerifyKey(decode_base58(public_key)).verify(message, _decode_base64_signature(signature_base64))
    except (BadSignatureError, ValueError) as exc:
        raise HTTPException(403, "signature verification failed") from exc


async def _verify_payment_authorization_from_signed_message(req: CreateIntentRequest) -> dict[str, Any]:
    mode = req.senderSettlementMode or ""
    action = (
        "PRU Spend" if mode == "pru_private_commitment_v1"
        else "Mixed Payment" if mode == "mixed_pru_wallet_v1"
        else "Payment Intent"
    )
    fields = _parse_canonical_message(req.senderAuthorizationMessage or "", action)
    amount_base_units = _parse_usdc_base_units(str(fields.get("Amount") or ""), "Amount")
    fee_base_units = _parse_usdc_base_units(str(fields.get("Fee") or ""), "Fee")
    recipient_tin = str(fields.get("Recipient TIN") or "")
    if not re.fullmatch(r"\d+", recipient_tin):
        raise HTTPException(400, "Recipient TIN must be plain digits in the signed message")
    if req.recipientTin and req.recipientTin != recipient_tin:
        raise HTTPException(400, "recipientTin differs from the signed message")
    token_decimals = int(config.get_supported_token_metadata().get(str(req.tokenMintAddress), {}).get("decimals", 6))
    request_amount_base_units = ui_amount_to_base_units(req.amount, token_decimals)
    if amount_base_units != request_amount_base_units:
        raise HTTPException(400, "amount differs from the signed message")
    request_fee_base_units = ui_amount_to_base_units(req.senderFeeAmount or 0, token_decimals)
    if fee_base_units != request_fee_base_units:
        raise HTTPException(400, "senderFeeAmount differs from the signed message")
    if mode == "mixed_pru_wallet_v1":
        pru_portion_base_units = _parse_usdc_base_units(str(fields.get("PRU Portion") or ""), "PRU Portion")
        wallet_portion_base_units = _parse_usdc_base_units(str(fields.get("Wallet Top-Up Portion") or ""), "Wallet Top-Up Portion")
        if pru_portion_base_units + wallet_portion_base_units != amount_base_units + fee_base_units:
            raise HTTPException(400, "mixed funding portions do not equal amount plus fee")
        submitted_pru_portion = int(str(req.pruSpendAmountBaseUnits or "0")) + int(str(req.pruSpendSenderFeeBaseUnits or "0"))
        submitted_wallet_portion = int(str(req.walletTopUpAmountBaseUnits or "0")) + int(str(req.walletTopUpSenderFeeBaseUnits or "0"))
        if pru_portion_base_units != submitted_pru_portion:
            raise HTTPException(400, "PRU funding portion differs from the signed message")
        if wallet_portion_base_units != submitted_wallet_portion:
            raise HTTPException(400, "wallet top-up portion differs from the signed message")
        wallet_top_up_amount = int(str(req.walletTopUpAmountBaseUnits or "0"))
        if not req.senderSignedSettlementTransaction:
            raise HTTPException(400, "mixed funding requires the sender co-signed settlement transaction")
    if req.senderAuthorizationNonce and req.senderAuthorizationNonce != fields.get("Nonce"):
        raise HTTPException(400, "senderAuthorizationNonce differs from the signed message")
    expires_at = _parse_canonical_expiry(str(fields.get("Expires") or ""))
    if req.senderAuthorizationExpiresAt:
        submitted_expiry = datetime.fromisoformat(req.senderAuthorizationExpiresAt.replace("Z", "+00:00"))
        if submitted_expiry != expires_at:
            raise HTTPException(400, "senderAuthorizationExpiresAt differs from the signed message")
    await _assert_canonical_nonce_unused(action=action, nonce=str(fields.get("Nonce") or ""))
    _verify_ed25519_signature(
        public_key=str(req.senderWallet or ""),
        message=(req.senderAuthorizationMessage or "").encode("utf-8"),
        signature_base64=str(req.senderAuthorizationSignature or ""),
    )
    return {
        "recipientTin": recipient_tin,
        "senderAuthorizationNonce": str(fields["Nonce"]),
        "senderAuthorizationExpiresAt": expires_at.isoformat(timespec="milliseconds").replace("+00:00", "Z"),
    }


def _build_pru_route_proof_message(
    *,
    tin: str,
    purpose: str,
    owner_pubkey: str,
    nonce: str,
    timestamp: int,
    platform_read_key: Optional[str] = None,
    expiry: Optional[int] = None,
) -> bytes:
    purpose_label = {
        "pru_route_lookup": "Load TIN Balance",
        "delegate_read_access": "Delegate Balance Access",
        "revoke_read_access": "Revoke Balance Access",
    }.get(purpose, purpose)
    expires_ts = expiry or (timestamp + 300)
    expires_iso = datetime.fromtimestamp(expires_ts, tz=timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")
    return _build_canonical_message(
        "Balance Access",
        [
            ("TIN", tin),
            ("Purpose", purpose_label),
            ("Nonce", nonce),
            ("Expires", expires_iso),
        ],
    ).encode("utf-8")


def _build_platform_pru_route_request_message(*, tin: str, platform_read_key: str) -> bytes:
    return "\n".join(
        [
            "TrustLink TSN Platform PRU Route Request",
            "version=1",
            f"tin={tin}",
            f"platformReadKey={platform_read_key}",
        ]
    ).encode("utf-8")


def _decode_signed_message_base64(value: Optional[str]) -> Optional[bytes]:
    if not value:
        return None
    try:
        return base64.b64decode(value, validate=True)
    except (binascii.Error, ValueError) as exc:
        raise HTTPException(403, "signed message is not valid base64") from exc


def _assert_pru_route_signed_message_matches(
    *,
    signed_message: bytes,
    tin: str,
    purpose: str,
    nonce: str,
    timestamp: int,
    expiry: Optional[int] = None,
) -> bytes:
    try:
        message_text = signed_message.decode("utf-8")
    except UnicodeDecodeError as exc:
        raise HTTPException(403, "signed message is not valid UTF-8") from exc
    fields = _parse_canonical_message(message_text, "Balance Access")
    purpose_label = {
        "pru_route_lookup": "Load TIN Balance",
        "delegate_read_access": "Delegate Balance Access",
        "revoke_read_access": "Revoke Balance Access",
    }.get(purpose, purpose)
    expected_expires = datetime.fromtimestamp(
        expiry or (timestamp + 300),
        tz=timezone.utc,
    ).isoformat(timespec="milliseconds").replace("+00:00", "Z")
    if fields.get("TIN") != str(tin):
        raise HTTPException(403, "signed message TIN does not match the request")
    if fields.get("Purpose") != purpose_label:
        raise HTTPException(403, "signed message purpose does not match the request")
    if fields.get("Nonce") != nonce:
        raise HTTPException(403, "signed message nonce does not match the request")
    if fields.get("Expires") != expected_expires:
        raise HTTPException(403, "signed message expiry does not match the request")
    return signed_message


async def _assert_pru_route_nonce_unused(*, purpose: str, tin: str, owner_pubkey: str, nonce: str) -> None:
    now = int(time.time())
    nonce_key = hashlib.sha256(f"{purpose}|{tin}|{owner_pubkey}|{nonce}".encode("utf-8")).hexdigest()
    store = await get_mempool_store()
    for key, raw in list((await store.hgetall(k_tin_pru_route_nonces())).items()):
        try:
            value = json.loads(raw)
        except json.JSONDecodeError:
            continue
        if int(value.get("expiresAt") or 0) <= now:
            await store.hset(k_tin_pru_route_nonces(), key, json.dumps({"expired": True, "expiresAt": 0}))
    existing = await store.hget(k_tin_pru_route_nonces(), nonce_key)
    if existing:
        try:
            value = json.loads(existing)
        except json.JSONDecodeError:
            value = {}
        if int(value.get("expiresAt") or 0) > now:
            raise HTTPException(403, "nonce has already been used")
    await store.hset(
        k_tin_pru_route_nonces(),
        nonce_key,
        json.dumps({"tin": tin, "ownerPubkey": owner_pubkey, "purpose": purpose, "expiresAt": now + 300}),
    )


async def _create_pru_route_session(*, tin: str, owner_hash: str) -> TinPruRouteSessionResponse:
    token = secrets.token_urlsafe(32)
    expires_at = int(time.time()) + 24 * 60 * 60
    await (await get_mempool_store()).hset(
        k_tin_pru_route_sessions(),
        token,
        json.dumps({"tin": tin, "ownerPubkeyHash": owner_hash, "expiresAt": expires_at}),
    )
    return TinPruRouteSessionResponse(token=token, expiresAt=expires_at, tin=tin)


async def _read_pru_route_session(token: str) -> Optional[dict[str, Any]]:
    raw = await (await get_mempool_store()).hget(k_tin_pru_route_sessions(), token)
    if not raw:
        return None
    try:
        session = json.loads(raw)
    except json.JSONDecodeError:
        return None
    if int(session.get("expiresAt") or 0) <= int(time.time()):
        return None
    return session


def _bearer_token(authorization: Optional[str]) -> Optional[str]:
    if not authorization:
        return None
    prefix = "Bearer "
    return authorization[len(prefix):].strip() if authorization.startswith(prefix) else authorization.strip()
