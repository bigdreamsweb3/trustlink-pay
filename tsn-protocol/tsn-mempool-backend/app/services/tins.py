from __future__ import annotations

import base64
import binascii
import hashlib
import json
import os
import secrets
import time
from datetime import datetime, timezone
from typing import Any, Optional
from uuid import uuid4

from fastapi import HTTPException
from nacl.exceptions import CryptoError
from nacl.public import PrivateKey, SealedBox
from nacl.signing import SigningKey
from solders.pubkey import Pubkey

from app import config
from app.schemas.tin import (
    PublicTinOperationRecord,
    TinDelegatedPlatformRecord,
    TinOperationFeeRecord,
    TinOperationRecord,
    TinPruPublicAddress,
    TinPruRoutePublicResponse,
)
from app.services.auth import (
    _assert_pru_route_nonce_unused,
    _assert_pru_route_signed_message_matches,
    _build_pru_route_proof_message,
    _decode_signed_message_base64,
    _verify_ed25519_signature,
)
from app.solana import (
    decode_tin_account_header,
    find_tins_owner_hash_by_tin,
    get_tins_identity_pda,
    read_tin_fee_config,
    read_tins_account_data,
    verify_onchain_tin_for_shadow_import,
)
from app.store import (
    get_mempool_store,
    hget_all_json,
    k_platform_read_keys,
    k_tin_fees,
    k_tin_operations,
    k_tin_pru_routes,
    k_tin_read_delegations,
    k_tin_registry_shadow,
)
from app.utils.encoding import decode_base58, decode_secret_key


def public_tin_operation(record: TinOperationRecord | dict[str, Any]) -> PublicTinOperationRecord:
    data = record.model_dump() if isinstance(record, TinOperationRecord) else dict(record)
    return PublicTinOperationRecord(**{key: value for key, value in data.items() if key != "ownerPubkey"})


def _field(data: dict[str, Any], *names: str, default: Any = None) -> Any:
    for name in names:
        if name in data and data[name] is not None:
            return data[name]
    return default


def _require_string(data: dict[str, Any], *names: str) -> str:
    value = _field(data, *names)
    if value is None or str(value).strip() == "":
        raise HTTPException(422, f"{names[0]} is required")
    return str(value).strip()


def _decode_hash32(value: Any, label: str) -> bytes:
    text = str(value or "").strip()
    if len(text) != 64:
        raise HTTPException(422, f"{label} must be a 32-byte hex value")
    try:
        decoded = bytes.fromhex(text)
    except ValueError as exc:
        raise HTTPException(422, f"{label} must be a 32-byte hex value") from exc
    if len(decoded) != 32:
        raise HTTPException(422, f"{label} must be a 32-byte hex value")
    return decoded


def _decode_base64_blob(value: Any, label: str) -> bytes:
    try:
        decoded = base64.b64decode(str(value or ""), validate=True)
    except (binascii.Error, ValueError) as exc:
        raise HTTPException(422, f"{label} must be base64") from exc
    if not decoded:
        raise HTTPException(422, f"{label} must not be empty")
    return decoded


def _decode_owner_pubkey(value: str) -> bytes:
    try:
        owner_bytes = decode_base58(value)
    except ValueError as exc:
        raise HTTPException(422, "owner_pubkey is not valid base58") from exc
    if len(owner_bytes) != 32:
        raise HTTPException(422, "owner_pubkey must decode to 32 bytes")
    try:
        Pubkey.from_string(value)
    except ValueError as exc:
        raise HTTPException(422, "owner_pubkey is not a valid Solana pubkey") from exc
    return owner_bytes


def _expiry_from_input(value: Any) -> int:
    try:
        expiry = int(value)
    except (TypeError, ValueError) as exc:
        raise HTTPException(422, "expiry must be a unix timestamp in seconds") from exc
    if expiry <= int(time.time()):
        raise HTTPException(409, "TIN operation intent is expired")
    return expiry


def _sha256_hex_utf8(*parts: Any) -> str:
    return hashlib.sha256("|".join(str(part) for part in parts).encode("utf-8")).hexdigest()


def _encode_signed_i64_le(value: int) -> bytes:
    return int(value).to_bytes(8, "little", signed=True)


def _require_phone_number(payload: dict[str, Any], intent_type: str) -> str:
    phone_number = _require_string(
        payload,
        "phone_number",
        "phoneNumber",
        *(("new_phone_number", "newPhoneNumber") if intent_type == "tin_update" else ()),
    )
    return phone_number.strip()


def _compute_owner_intent_hash_v2(*, intent_type: str, owner_bytes: bytes, tin: str, display_name: str, phone_number: str, nonce_bytes: bytes, expiry: int) -> bytes:
    domain = config.TIN_OWNER_INTENT_CREATE_DOMAIN_V2 if intent_type == "tin_creation" else config.TIN_OWNER_INTENT_UPDATE_DOMAIN_V2
    return hashlib.sha256(
        b"".join(
            [
                domain.encode("utf-8"),
                owner_bytes,
                tin.encode("utf-8"),
                display_name.encode("utf-8"),
                phone_number.encode("utf-8"),
                nonce_bytes,
                _encode_signed_i64_le(expiry),
            ]
        )
    ).digest()


def _encrypt_tin_master_seed_payload(master_seed_hex: str) -> str:
    secret = config.TSN_ROUTE_ENCRYPTION_SECRET_KEY.strip()
    if not secret:
        raise HTTPException(503, "TSN_ROUTE_ENCRYPTION_SECRET_KEY is missing; mempool cannot assemble private TIN payloads")
    try:
        secret_bytes = decode_secret_key(secret, {32}, "TSN_ROUTE_ENCRYPTION_SECRET_KEY")
        ciphertext = SealedBox(PrivateKey(secret_bytes).public_key).encrypt(bytes.fromhex(master_seed_hex))
    except (ValueError, TypeError, CryptoError, binascii.Error) as exc:
        raise HTTPException(503, "TSN route encryption key is invalid") from exc
    return base64.b64encode(ciphertext).decode("ascii")


def _decrypt_tin_master_seed_payload(encrypted_master_seed: str) -> str:
    secret = config.TSN_ROUTE_ENCRYPTION_SECRET_KEY.strip()
    if not secret:
        raise HTTPException(503, "TSN_ROUTE_ENCRYPTION_SECRET_KEY is missing; mempool cannot authorize PRU spending")
    try:
        secret_bytes = decode_secret_key(secret, {32}, "TSN_ROUTE_ENCRYPTION_SECRET_KEY")
        plaintext = SealedBox(PrivateKey(secret_bytes)).decrypt(base64.b64decode(encrypted_master_seed, validate=True))
    except (ValueError, TypeError, CryptoError, binascii.Error) as exc:
        raise HTTPException(503, "TIN Master Seed payload cannot be decrypted") from exc
    if len(plaintext) != 32:
        raise HTTPException(503, "TIN Master Seed payload has an invalid length")
    return plaintext.hex()


def _derive_pru_public_key_hex(*, master_seed_hex: str, tin: str, index: int) -> str:
    seed = hashlib.sha256(f"TRUSTLINK_PRU_KEY_V1|{master_seed_hex}|{tin}|{index}".encode("utf-8")).digest()
    return SigningKey(seed).verify_key.encode().hex()


def _derive_pru_secret_key_base64(*, master_seed_hex: str, tin: str, index: int) -> str:
    seed = hashlib.sha256(f"TRUSTLINK_PRU_KEY_V1|{master_seed_hex}|{tin}|{index}".encode("utf-8")).digest()
    signing_key = SigningKey(seed)
    return base64.b64encode(signing_key.encode() + signing_key.verify_key.encode()).decode("ascii")


def _derive_pru_route_record(*, tin: str, master_seed_hex: Optional[str] = None) -> dict[str, Any]:
    master_seed_hex = master_seed_hex or secrets.token_hex(32)
    canonical_lines = []
    prus: list[dict[str, Any]] = []
    for index in range(config.TIN_DEFAULT_PRU_COUNT):
        public_key_hex = _derive_pru_public_key_hex(master_seed_hex=master_seed_hex, tin=tin, index=index)
        canonical_lines.append(f"{tin}:{index}:{public_key_hex}:")
        prus.append({"index": index, "publicKey": __import__("app.utils.encoding", fromlist=["encode_base58"]).encode_base58(bytes.fromhex(public_key_hex)), "publicKeyHex": public_key_hex, "state": "ACTIVE"})
    canonical = "\n".join(canonical_lines)
    return {
        "tin": tin,
        "masterSeedHex": master_seed_hex,
        "pruConfigurationHash": _sha256_hex_utf8(config.TIN_PRU_CONFIGURATION_TAG, canonical),
        "prus": prus,
    }


def _build_private_tin_payload(*, intent_type: str, tin: str, owner_pubkey: str, display_name: str, phone_number: str) -> dict[str, Any]:
    pru_route = _derive_pru_route_record(tin=tin)
    encrypted_master_seed = _encrypt_tin_master_seed_payload(str(pru_route["masterSeedHex"]))
    encrypted_metadata_hash = hashlib.sha256(
        b"".join(
            [
                config.TIN_PRIVATE_METADATA_DOMAIN_V1.encode("utf-8"),
                intent_type.encode("utf-8"),
                tin.encode("utf-8"),
                owner_pubkey.encode("utf-8"),
                display_name.encode("utf-8"),
                phone_number.encode("utf-8"),
            ]
        )
    ).hexdigest()
    return {
        "encrypted_master_seed": encrypted_master_seed,
        "encrypted_metadata_hash": encrypted_metadata_hash,
        "pru_configuration_hash": str(pru_route["pruConfigurationHash"]),
        "pru_route": pru_route,
    }


def _normalize_tin_operation_input(payload: dict[str, Any]) -> dict[str, Any]:
    intent_type = _require_string(payload, "intent_type", "intentType")
    if intent_type not in {"tin_creation", "tin_update"}:
        raise HTTPException(422, "intent_type must be tin_creation or tin_update")
    intent_id = str(_field(payload, "intent_id", "intentId", default=str(uuid4()))).strip()
    if not intent_id:
        raise HTTPException(422, "intent_id must not be empty")
    tin = _require_string(payload, "tin")
    encrypted_master_seed = str((_field(payload, "encrypted_master_seed", "encryptedMasterSeed") or _field(payload, "new_encrypted_master_seed", "newEncryptedMasterSeed") or "")).strip()
    encrypted_metadata_hash = str(_field(payload, "encrypted_metadata_hash", "encryptedMetadataHash", "new_encrypted_metadata_hash", "newEncryptedMetadataHash", default="") or "").strip()
    pru_configuration_hash = str(_field(payload, "pru_configuration_hash", "pruConfigurationHash", "new_pru_configuration_hash", "newPruConfigurationHash", default="") or "").strip()
    owner_intent_hash = _require_string(payload, "owner_intent_hash", "ownerIntentHash")
    owner_intent_message = str(_field(payload, "owner_intent_message", "ownerIntentMessage", default="") or "")
    nonce = _require_string(payload, "nonce")
    owner_pubkey = _require_string(payload, "owner_pubkey", "ownerPubkey")
    owner_signature = _require_string(payload, "owner_signature", "ownerSignature")
    display_name = str(_field(payload, "display_name", "displayName", "new_display_name", "newDisplayName", default="")).strip()
    if not display_name:
        raise HTTPException(422, "display_name is required")
    owner_bytes = _decode_owner_pubkey(owner_pubkey)
    intent_hash_bytes = _decode_hash32(owner_intent_hash, "owner_intent_hash")
    nonce_bytes = _decode_hash32(nonce, "nonce")
    signature_bytes = _decode_base64_blob(owner_signature, "owner_signature")
    if len(signature_bytes) != 64:
        raise HTTPException(422, "owner_signature must be a 64-byte Ed25519 signature")
    expiry = _expiry_from_input(_field(payload, "expiry", "expiry_ts", "expiryTs"))
    phone_number = _require_phone_number(payload, intent_type)
    uses_client_assembled_payload = bool(encrypted_master_seed or encrypted_metadata_hash or pru_configuration_hash)
    pru_route: Optional[dict[str, Any]] = None
    if uses_client_assembled_payload:
        _decode_base64_blob(encrypted_master_seed, "encrypted_master_seed")
        _decode_hash32(encrypted_metadata_hash, "encrypted_metadata_hash")
        _decode_hash32(pru_configuration_hash, "pru_configuration_hash")
    else:
        assembled_payload = _build_private_tin_payload(
            intent_type=intent_type,
            tin=tin,
            owner_pubkey=owner_pubkey,
            display_name=display_name,
            phone_number=phone_number,
        )
        encrypted_master_seed = assembled_payload["encrypted_master_seed"]
        encrypted_metadata_hash = assembled_payload["encrypted_metadata_hash"]
        pru_configuration_hash = assembled_payload["pru_configuration_hash"]
        pru_route = assembled_payload["pru_route"]
    expected_intent_hash = _compute_owner_intent_hash_v2(
        intent_type=intent_type,
        owner_bytes=owner_bytes,
        tin=tin,
        display_name=display_name,
        phone_number=phone_number,
        nonce_bytes=nonce_bytes,
        expiry=expiry,
    )
    if intent_hash_bytes != expected_intent_hash:
        raise HTTPException(409, "owner_intent_hash does not match the owner-signed TIN intent")
    _verify_ed25519_signature(public_key=owner_pubkey, message=(owner_intent_message or expected_intent_hash.hex()).encode("utf-8") if owner_intent_message else expected_intent_hash, signature_base64=owner_signature)
    now_iso = datetime.now(timezone.utc).isoformat()
    operation = {
        "intentId": intent_id,
        "intentType": intent_type,
        "tin": tin,
        "ownerPubkey": owner_pubkey,
        "ownerSignature": owner_signature,
        "ownerIntentHash": owner_intent_hash.lower(),
        "ownerIntentMessage": owner_intent_message or None,
        "nonce": nonce.lower(),
        "expiry": expiry,
        "createdAt": now_iso,
        "updatedAt": now_iso,
        "status": "pending_verification",
        "verifierCranker": None,
        "submitterCranker": None,
        "feeMetadata": None,
        "failureReason": None,
        "onchainSignatures": [],
        "displayName": display_name,
        "encryptedMasterSeed": encrypted_master_seed,
        "encryptedMetadataHash": encrypted_metadata_hash.lower(),
        "pruConfigurationHash": pru_configuration_hash.lower(),
        "pruCount": config.TIN_DEFAULT_PRU_COUNT,
        "creationFeeAmount": config.TIN_CREATION_FEE_USDC if intent_type == "tin_creation" else None,
        "updateFeeAmount": config.TIN_UPDATE_FEE_USDC if intent_type == "tin_update" else None,
        "creationFeeMint": config.TIN_DEFAULT_FEE_MINT if intent_type == "tin_creation" else None,
        "updateFeeMint": config.TIN_DEFAULT_FEE_MINT if intent_type == "tin_update" else None,
    }
    if pru_route is not None:
        operation["_pruRoute"] = pru_route
    return operation


def _fee_amount_base_units(operation: dict[str, Any]) -> int:
    fee_amount = operation.get("creationFeeAmount") if operation.get("intentType") == "tin_creation" else operation.get("updateFeeAmount")
    value = str(fee_amount or "0").strip()
    if not value:
        return 0
    whole, _, fraction = value.partition(".")
    normalized = whole + fraction.ljust(6, "0")[:6]
    return int(normalized)


def compute_tin_fee_split(gross_amount: int) -> dict[str, int]:
    verifier = (gross_amount * config.TIN_FEE_SPLIT_BPS["verifier"]) // 10_000
    submitter = (gross_amount * config.TIN_FEE_SPLIT_BPS["submitter"]) // 10_000
    team = (gross_amount * config.TIN_FEE_SPLIT_BPS["team"]) // 10_000
    return {
        "verifier": verifier,
        "submitter": submitter,
        "team": team,
        "reserve_pool": gross_amount - verifier - submitter - team,
    }


def compute_tin_fee_commitment_hash(operation: dict[str, Any], fee_record: dict[str, Any]) -> str:
    return _sha256_hex_utf8(
        operation["intentId"],
        operation["tin"],
        fee_record["feeMint"],
        fee_record["grossAmount"],
        fee_record["verifierAmount"],
        fee_record["submitterAmount"],
        fee_record["teamAmount"],
        fee_record["reservePoolAmount"],
        fee_record.get("verifierPubkey") or "",
        fee_record.get("submitterPubkey") or "",
        fee_record.get("teamPubkey") or "",
        fee_record.get("reservePoolPubkey") or "",
    )


def append_unique_signature(signatures: Any, tx_sig: str) -> list[str]:
    existing = [str(signature) for signature in (signatures or []) if str(signature)]
    if tx_sig not in existing:
        existing.append(tx_sig)
    return existing


async def read_shadow_tin_owner(tin: str) -> Optional[str]:
    raw = await (await get_mempool_store()).hget(k_tin_registry_shadow(), str(tin))
    if not raw:
        return None
    try:
        return str((json.loads(raw) or {}).get("ownerPubkey") or "")
    except json.JSONDecodeError:
        return None


async def write_shadow_tin_owner(operation: dict[str, Any]) -> None:
    await (await get_mempool_store()).hset(
        k_tin_registry_shadow(),
        str(operation["tin"]),
        json.dumps({"tin": str(operation["tin"]), "ownerPubkey": str(operation["ownerPubkey"]), "updatedAt": datetime.now(timezone.utc).isoformat()}),
    )


async def import_shadow_tin_owner(operation: dict[str, Any], onchain: dict[str, Any]) -> None:
    await (await get_mempool_store()).hset(k_tin_registry_shadow(), str(operation["tin"]), json.dumps(onchain))


async def write_tin_pru_route(operation: dict[str, Any], route: dict[str, Any]) -> None:
    owner_pubkey_hash = hashlib.sha256(decode_base58(str(operation["ownerPubkey"]))).hexdigest()
    await (await get_mempool_store()).hset(
        k_tin_pru_routes(),
        str(operation["tin"]),
        json.dumps(
            {
                "tin": str(operation["tin"]),
                "intentId": operation["intentId"],
                "ownerPubkeyHash": owner_pubkey_hash,
                "pruConfigurationHash": route["pruConfigurationHash"],
                "prus": route["prus"],
                "status": "pending",
                "updatedAt": datetime.now(timezone.utc).isoformat(),
            }
        ),
    )


async def mark_tin_pru_route_finalized(operation: dict[str, Any]) -> None:
    store = await get_mempool_store()
    raw = await store.hget(k_tin_pru_routes(), str(operation["tin"]))
    if not raw:
        return
    route = json.loads(raw)
    route["status"] = "finalized"
    route["updatedAt"] = datetime.now(timezone.utc).isoformat()
    await store.hset(k_tin_pru_routes(), str(operation["tin"]), json.dumps(route))


def _route_owner_pubkey_hash(route: dict[str, Any]) -> Optional[str]:
    owner_pubkey_hash = route.get("ownerPubkeyHash")
    if isinstance(owner_pubkey_hash, str) and owner_pubkey_hash.strip():
        return owner_pubkey_hash.strip().lower()
    legacy_owner = route.get("ownerPubkey")
    if not isinstance(legacy_owner, str) or not legacy_owner.strip():
        return None
    try:
        return hashlib.sha256(decode_base58(legacy_owner.strip())).hexdigest()
    except ValueError:
        return None


async def read_tin_pru_route(tin: str) -> Optional[dict[str, Any]]:
    store = await get_mempool_store()
    raw = await store.hget(k_tin_pru_routes(), str(tin))
    if not raw:
        return None
    route = json.loads(raw)
    if route.get("status") != "finalized":
        return None
    if not isinstance(route.get("prus"), list) or not route["prus"]:
        return None
    owner_pubkey_hash = _route_owner_pubkey_hash(route)
    if owner_pubkey_hash and route.get("ownerPubkeyHash") != owner_pubkey_hash:
        route["ownerPubkeyHash"] = owner_pubkey_hash
        await store.hset(k_tin_pru_routes(), str(tin), json.dumps(route))
    return route


async def read_finalized_tin_route_material(tin: str) -> Optional[dict[str, str]]:
    operations = sorted(
        [item for item in await hget_all_json(k_tin_operations()) if str(item.get("tin") or "") == str(tin) and item.get("status") == "finalized"],
        key=lambda item: str(item.get("updatedAt") or item.get("createdAt") or ""),
        reverse=True,
    )
    for operation in operations:
        encrypted_master_seed = operation.get("newEncryptedMasterSeed") or operation.get("encryptedMasterSeed")
        if not encrypted_master_seed:
            continue
        return {
            "masterSeedHex": _decrypt_tin_master_seed_payload(str(encrypted_master_seed)),
            "ownerPubkey": str(operation.get("ownerPubkey") or ""),
        }
    route = await read_tin_pru_route(tin)
    if route:
        legacy_master_seed = str(route.get("masterSeedHex") or "").strip()
        legacy_owner_pubkey = str(route.get("ownerPubkey") or "").strip()
        if legacy_master_seed and legacy_owner_pubkey:
            try:
                bytes.fromhex(legacy_master_seed)
                decode_base58(legacy_owner_pubkey)
            except ValueError:
                return None
            return {
                "masterSeedHex": legacy_master_seed,
                "ownerPubkey": legacy_owner_pubkey,
            }
    return None


def public_tin_pru_route(route: dict[str, Any]) -> TinPruRoutePublicResponse:
    public_prus = []
    for pru in route.get("prus", []):
        if not isinstance(pru, dict):
            continue
        public_key = str(pru.get("publicKey") or "").strip()
        if not public_key:
            continue
        public_prus.append(TinPruPublicAddress(index=int(pru.get("index") or 0), publicKey=public_key, state=str(pru.get("state") or "ACTIVE")))
    return TinPruRoutePublicResponse(tin=str(route["tin"]), pruConfigurationHash=str(route["pruConfigurationHash"]), status="finalized", prus=public_prus)


async def _read_onchain_tin_owner_hash(*, tin: str, owner_pubkey: str) -> Optional[str]:
    identity_pubkey = get_tins_identity_pda(owner_pubkey)
    data = await read_tins_account_data(identity_pubkey)
    if data:
        try:
            decoded = decode_tin_account_header(data)
            if str(decoded.get("tin")) == str(tin):
                return str(decoded.get("ownerPubkeyHash") or "").lower()
        except ValueError:
            pass
    return await find_tins_owner_hash_by_tin(tin)


def _accepted_onchain_owner_markers(owner_pubkey: str) -> set[str]:
    owner_pubkey_bytes = decode_base58(owner_pubkey)
    return {
        hashlib.sha256(owner_pubkey_bytes).hexdigest(),
        owner_pubkey_bytes.hex(),
        bytes(get_tins_identity_pda(owner_pubkey)).hex(),
    }


async def _assert_owner_controls_tin(*, tin: str, owner_pubkey: str, accepted_owner_hash: Optional[str] = None) -> str:
    owner_hash = hashlib.sha256(decode_base58(owner_pubkey)).hexdigest()
    accepted_onchain_markers = _accepted_onchain_owner_markers(owner_pubkey)
    onchain_hash = await _read_onchain_tin_owner_hash(tin=tin, owner_pubkey=owner_pubkey)
    if accepted_owner_hash == owner_hash:
        if onchain_hash and onchain_hash not in accepted_onchain_markers:
            config.logger.warning("PRU route owner proof rejected: tin=%s ownerHash=%s routeHash=%s onchainHash=%s", tin, owner_hash[:12], str(accepted_owner_hash)[:12], onchain_hash[:12])
            raise HTTPException(403, "owner_pubkey does not match the on-chain TIN owner commitment")
        return owner_hash
    if not onchain_hash:
        config.logger.warning("PRU route owner proof rejected: tin=%s ownerHash=%s reason=missing-onchain-owner", tin, owner_hash[:12])
        raise HTTPException(403, "TIN owner account was not found on-chain")
    if onchain_hash not in accepted_onchain_markers and accepted_owner_hash != owner_hash:
        config.logger.warning("PRU route owner proof rejected: tin=%s ownerHash=%s routeHash=%s onchainHash=%s", tin, owner_hash[:12], str(accepted_owner_hash or "")[:12], onchain_hash[:12])
        raise HTTPException(403, "owner_pubkey does not match the on-chain TIN owner commitment")
    return owner_hash


async def verify_owner_pru_route_proof(*, tin: str, owner_pubkey: str, signature: str, nonce: str, timestamp: int, purpose: str, platform_read_key: Optional[str] = None, expiry: Optional[int] = None, accepted_owner_hash: Optional[str] = None, signed_message_base64: Optional[str] = None) -> str:
    now = int(time.time())
    if abs(now - int(timestamp)) > 60:
        raise HTTPException(403, "authorization timestamp is outside the allowed window")
    await _assert_pru_route_nonce_unused(purpose=purpose, tin=tin, owner_pubkey=owner_pubkey, nonce=nonce)
    owner_hash = await _assert_owner_controls_tin(tin=tin, owner_pubkey=owner_pubkey, accepted_owner_hash=accepted_owner_hash)
    provided_signed_message = _decode_signed_message_base64(signed_message_base64)
    message = (
        _assert_pru_route_signed_message_matches(signed_message=provided_signed_message, tin=tin, purpose=purpose, nonce=nonce, timestamp=timestamp, expiry=expiry)
        if provided_signed_message is not None
        else _build_pru_route_proof_message(tin=tin, purpose=purpose, owner_pubkey=owner_pubkey, nonce=nonce, timestamp=timestamp, platform_read_key=platform_read_key, expiry=expiry)
    )
    _verify_ed25519_signature(public_key=owner_pubkey, message=message, signature_base64=signature)
    return owner_hash


async def assert_tin_operation_can_enter(operation: dict[str, Any]) -> None:
    existing_owner = await read_shadow_tin_owner(str(operation["tin"]))
    if operation["intentType"] == "tin_creation" and existing_owner:
        raise HTTPException(409, "TIN already exists in mempool registry shadow")
    if operation["intentType"] == "tin_update":
        if not existing_owner:
            onchain = await verify_onchain_tin_for_shadow_import(operation)
            if not onchain:
                raise HTTPException(409, "TIN does not exist in mempool registry shadow")
            await import_shadow_tin_owner(operation, onchain)
            existing_owner = operation["ownerPubkey"]
            config.logger.info("Imported legacy TIN into mempool registry shadow: tin=%s identity=%s", operation["tin"], onchain.get("identityPubkey"))
        if existing_owner != operation["ownerPubkey"]:
            raise HTTPException(409, "owner_pubkey does not match stored TIN owner")
    for existing in await hget_all_json(k_tin_operations()):
        if existing.get("intentId") == operation["intentId"]:
            continue
        if existing.get("ownerPubkey") == operation["ownerPubkey"] and existing.get("nonce") == operation["nonce"]:
            raise HTTPException(409, "nonce has already been used by this owner_pubkey")
        if operation["intentType"] == "tin_creation" and existing.get("tin") == operation["tin"] and existing.get("status") not in config.TIN_OPERATION_TERMINAL_STATUSES:
            raise HTTPException(409, "TIN already has an active creation intent")


async def expire_stale_tin_operations() -> None:
    store = await get_mempool_store()
    now_ts = int(time.time())
    for raw in await hget_all_json(k_tin_operations()):
        if raw.get("status") in config.TIN_OPERATION_TERMINAL_STATUSES or int(raw.get("expiry") or 0) > now_ts:
            continue
        raw["status"] = "expired"
        raw["failureReason"] = "Owner authorization expired before finalization."
        raw["updatedAt"] = datetime.now(timezone.utc).isoformat()
        await store.hset(k_tin_operations(), str(raw["intentId"]), json.dumps(raw))


async def patch_tin_operation(intent_id: str, patch: dict[str, Any], allowed_statuses: set[str]) -> TinOperationRecord:
    store = await get_mempool_store()
    raw = await store.hget(k_tin_operations(), intent_id)
    if not raw:
        raise HTTPException(404, f"TIN operation {intent_id} not found")
    data = json.loads(raw)
    if data.get("status") not in allowed_statuses:
        raise HTTPException(409, f"TIN operation is {data.get('status')}, not ready for this transition")
    data.update(patch)
    data["updatedAt"] = datetime.now(timezone.utc).isoformat()
    await store.hset(k_tin_operations(), intent_id, json.dumps(data))
    return TinOperationRecord(**data)


def _delegation_key(tin: str, platform_read_key: str) -> str:
    return hashlib.sha256(f"{tin}|{platform_read_key}".encode("utf-8")).hexdigest()


async def read_active_delegation(*, tin: str, platform_read_key: str) -> Optional[dict[str, Any]]:
    raw = await (await get_mempool_store()).hget(k_tin_read_delegations(), _delegation_key(tin, platform_read_key))
    if not raw:
        return None
    try:
        delegation = json.loads(raw)
    except json.JSONDecodeError:
        return None
    if int(delegation.get("expiresAt") or 0) <= int(time.time()):
        return None
    return delegation


async def list_delegated_read_access_rows(tin: str) -> list[TinDelegatedPlatformRecord]:
    platform_records = await (await get_mempool_store()).hgetall(k_platform_read_keys())
    rows: list[TinDelegatedPlatformRecord] = []
    now = int(time.time())
    for raw in (await (await get_mempool_store()).hgetall(k_tin_read_delegations())).values():
        try:
            delegation = json.loads(raw)
        except json.JSONDecodeError:
            continue
        if str(delegation.get("tin")) != str(tin):
            continue
        expires_at = int(delegation.get("expiresAt") or 0)
        if expires_at <= now:
            continue
        platform_key = str(delegation.get("platformReadKey") or "")
        platform_contact = None
        if platform_key in platform_records:
            try:
                platform_contact = json.loads(platform_records[platform_key]).get("contact")
            except json.JSONDecodeError:
                platform_contact = None
        rows.append(TinDelegatedPlatformRecord(platformReadKey=platform_key, contact=platform_contact, expiresAt=expires_at))
    return rows
