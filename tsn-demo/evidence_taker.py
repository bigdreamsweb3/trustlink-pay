#!/usr/bin/env python3
"""Capture allowlisted TSN Devnet flow evidence without service secrets."""

from __future__ import annotations

import argparse
import base64
import hashlib
import json
import os
import re
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_STORE = ROOT / "tsn-protocol/services/tsn-receiver/.receiver-store.json"
DEFAULT_RPC = "https://tsn-rpc-gateway.vercel.app"
DEFAULT_OUT = ROOT / "tsn-demo/evidence/tin-creation"
EVIDENCE_ROOT = ROOT / "tsn-demo/evidence"
SOURCE_MEDIA_DIR = ROOT / "tsn-demo/source"
CURRENT_FLOW_ID = "tin-creation"
CURRENT_FLOW_TITLE = "Private TIN creation"
FLOW_CATALOG = [
    {
        "id": CURRENT_FLOW_ID,
        "title": CURRENT_FLOW_TITLE,
        "status": "implemented",
        "evidencePath": "tin-creation/manifest.json",
    },
    {
        "id": "private-tin-transfer",
        "title": "Private TIN transfer",
        "status": "planned",
        "evidencePath": None,
        "captureRequirement": "Capture the actual SDK request, Receiver record, Node decision, Cranker lease, Solana result, and final Receiver state when this flow is run.",
    },
    {
        "id": "private-wallet-transfer",
        "title": "Private wallet transfer",
        "status": "planned",
        "evidencePath": None,
        "captureRequirement": "Capture the actual SDK request, Receiver record, Node decision, Cranker lease, Solana result, and final Receiver state when this flow is run.",
    },
    {
        "id": "settlement-funding",
        "title": "Settlement funding",
        "status": "planned",
        "evidencePath": None,
        "captureRequirement": "Capture the actual SDK request/transaction, Receiver record if used, Node decision if used, Cranker action if used, Solana result, and final state when this flow is run.",
    },
]
SVG_GRID_ROWS = 30


def write_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def source_media_manifest() -> list[dict[str, Any]]:
    media = []
    for path in sorted(SOURCE_MEDIA_DIR.glob("*")):
        if not path.is_file() or path.suffix.lower() not in {".webm", ".mp4", ".mov", ".mkv"}:
            continue
        digest = hashlib.sha256(path.read_bytes()).hexdigest()
        media.append({
            "path": path.relative_to(ROOT).as_posix(),
            "mediaType": path.suffix.lower().lstrip("."),
            "sizeBytes": path.stat().st_size,
            "sha256": digest,
            "relationship": "source recording reference; confirm its intent ID before treating it as the same run",
        })
    return media


def http_json(url: str, method: str = "GET", payload: dict[str, Any] | None = None,
              timeout: float = 10.0) -> tuple[int, Any]:
    data = json.dumps(payload).encode() if payload is not None else None
    request = urllib.request.Request(url, data=data, method=method,
                                     headers={"content-type": "application/json"})
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            raw = response.read()
            try:
                body = json.loads(raw)
            except (json.JSONDecodeError, UnicodeDecodeError):
                body = {"bodyPreview": raw[:300].decode("utf-8", "replace")}
            return response.status, body
    except urllib.error.HTTPError as error:
        raw = error.read()
        try:
            body = json.loads(raw)
        except (json.JSONDecodeError, UnicodeDecodeError):
            body = {"bodyPreview": raw[:300].decode("utf-8", "replace")}
        return error.code, body
    except (urllib.error.URLError, TimeoutError, OSError) as error:
        return 0, {"error": type(error).__name__, "message": str(error)[:240]}


def health_snapshot(args: argparse.Namespace) -> dict[str, Any]:
    endpoints = {
        "tsnXp": f"{args.xp.rstrip('/')}/api/health",
        "receiver": f"{args.receiver.rstrip('/')}/api/health",
        "node": f"{args.node.rstrip('/')}/settlement-networks",
        "rpc": args.rpc.rstrip("/"),
    }
    result: dict[str, Any] = {"services": {}}
    for name, url in endpoints.items():
        if name == "rpc":
            status, body = http_json(
                url,
                method="POST",
                timeout=args.timeout,
                payload={"jsonrpc": "2.0", "id": 1, "method": "getHealth"},
            )
        else:
            status, body = http_json(url, timeout=args.timeout)
        service: dict[str, Any] = {"httpStatus": status, "reachable": status == 200}
        if isinstance(body, dict):
            if name == "node":
                service["networkCount"] = len(body.get("networks", [])) if isinstance(body.get("networks"), list) else None
                service["status"] = body.get("status") or body.get("ready")
                service["source"] = body.get("source")
            else:
                for key in ("service", "status", "ok", "mode", "latencyMs"):
                    if key in body and isinstance(body[key], (str, int, float, bool, type(None))):
                        service[key] = body[key]
                if name == "rpc":
                    service["method"] = "getHealth"
                    service["result"] = body.get("result")
                    service["reachable"] = status == 200 and body.get("result") == "ok"
                    if isinstance(body.get("error"), dict):
                        service["rpcError"] = {
                            key: body["error"][key]
                            for key in ("code", "message")
                            if key in body["error"] and isinstance(body["error"][key], (str, int))
                        }
            if status != 200 and body.get("error"):
                service["error"] = body["error"]
        result["services"][name] = service
    return result


def safe_lease(value: Any) -> dict[str, Any] | None:
    if not isinstance(value, dict):
        return None
    safe = {key: value[key] for key in ("owner", "leaseId", "version", "expiresAt") if key in value}
    return safe or None


def encoded_bytes_length(value: Any) -> int | None:
    if not isinstance(value, str) or not value:
        return 0
    try:
        return len(base64.b64decode(value, validate=True))
    except (ValueError, base64.binascii.Error):
        return None


def inspect_seed_envelope(value: Any) -> dict[str, Any]:
    """Decode the JSON wrapper for inspection while preserving its source value."""
    if not isinstance(value, str) or not value:
        return {"present": False}
    try:
        decoded = base64.b64decode(value, validate=True)
        envelope = json.loads(decoded)
    except (ValueError, base64.binascii.Error, json.JSONDecodeError, UnicodeDecodeError):
        return {"present": True, "encoding": "base64", "decodedBytes": encoded_bytes_length(value),
                "inspection": "not a base64-encoded JSON envelope"}
    if not isinstance(envelope, dict):
        return {"present": True, "encoding": "base64", "decodedBytes": len(decoded),
                "inspection": "decoded JSON is not an object"}
    return {"present": True, "encoding": "base64", "decodedBytes": len(decoded),
            "decodedEnvelope": envelope}


def hex_field_summary(value: Any) -> dict[str, Any]:
    if not isinstance(value, str):
        return {"present": False, "encoding": "hex", "bytes": 0}
    normalized = value.strip().lower()
    valid = bool(re.fullmatch(r"[0-9a-f]*", normalized)) and len(normalized) % 2 == 0
    summary: dict[str, Any] = {
        "present": bool(normalized),
        "encoding": "hex",
        "bytes": len(normalized) // 2 if valid else None,
    }
    if valid and len(normalized) == 64:
        summary["short"] = f"{normalized[:12]}…{normalized[-8:]}"
        summary["zero"] = not any(normalized)
    return summary


def ingress_payload_summary(payload: Any) -> dict[str, Any] | None:
    if not isinstance(payload, dict):
        return None
    owner = payload.get("ownerPubkey")
    signature = payload.get("ownerSignature")
    encrypted_seed = payload.get("encryptedMasterSeed")
    message = payload.get("ownerIntentMessage")
    encrypted_route = payload.get("encryptedPublicRouteEnvelope")
    return {
        "intentType": payload.get("intentType"),
        "programAssigned": payload.get("programAssigned"),
        "ownerPubkey": owner if isinstance(owner, str) else None,
        "ownerSignature": {
            "present": isinstance(signature, str) and bool(signature),
            "encoding": "base64",
            "decodedBytes": encoded_bytes_length(signature),
            "value": "omitted",
        },
        "ownerIntentMessage": {
            "present": isinstance(message, str) and bool(message),
            "encoding": "UTF-8",
            "bytes": len(message.encode("utf-8")) if isinstance(message, str) else 0,
            "value": "omitted",
        },
        "ownerIntentHash": payload.get("ownerIntentHash"),
        "nonce": {"present": bool(payload.get("nonce")), "encoding": "hex", "bytes": 32, "value": "omitted"},
        "expiry": {"encoding": "Unix seconds", "value": payload.get("expiry")},
        "displayName": payload.get("displayName") if isinstance(payload.get("displayName"), str) else None,
        "encryptedMasterSeed": {
            "present": isinstance(encrypted_seed, str) and bool(encrypted_seed),
            "encoding": "base64",
            "decodedBytes": encoded_bytes_length(encrypted_seed),
            "ciphertext": "omitted",
        },
        "encryptedMetadataHash": hex_field_summary(payload.get("encryptedMetadataHash")),
        "pruConfigurationHash": hex_field_summary(payload.get("pruConfigurationHash")),
        "encryptedPublicRouteEnvelope": {
            "present": isinstance(encrypted_route, str) and bool(encrypted_route),
            "encoding": "base64",
            "value": "omitted",
        },
        "routeVersion": payload.get("routeVersion"),
        "routeNonce": {"present": bool(payload.get("routeNonce")), "encoding": "hex", "bytes": 32, "value": "omitted"},
        "tcapRouteVersion": payload.get("tcapRouteVersion"),
        "tcapRelationshipCommitment": hex_field_summary(payload.get("tcapRelationshipCommitment")),
        "tcapRelationshipReference": hex_field_summary(payload.get("tcapRelationshipReference")),
        "tcapPolicyCommitment": hex_field_summary(payload.get("tcapPolicyCommitment")),
    }


def complete_tin_payload(payload: Any) -> dict[str, Any] | None:
    """Copy the complete protocol TIN payload using an explicit field allowlist."""
    if not isinstance(payload, dict):
        return None
    keys = (
        "intentType", "programAssigned", "ownerPubkey", "ownerSignature", "displayName",
        "ownerIntentMessage", "ownerIntentHash", "nonce", "expiry", "encryptedMasterSeed",
        "encryptedMetadataHash", "pruConfigurationHash", "encryptedPublicRouteEnvelope",
        "routeVersion", "routeNonce", "tcapRouteVersion", "tcapRelationshipCommitment",
        "tcapRelationshipReference", "tcapPolicyCommitment", "tin", "lookupCommitment",
        "encryptedIdentityEnvelope", "newDisplayName", "newEncryptedMasterSeed",
        "newEncryptedMetadataHash", "newPruConfigurationHash", "newEncryptedPublicRouteEnvelope",
        "newRouteVersion", "newRouteNonce", "intentId", "intent_id", "source",
    )
    scalar = (str, int, float, bool, type(None))
    return {key: payload[key] for key in keys if key in payload and isinstance(payload[key], scalar)}


def complete_verified_tin_payload(payload: Any) -> dict[str, Any] | None:
    if not isinstance(payload, dict):
        return None
    keys = (
        "intentId", "intentType", "tin", "programAssigned", "ownerPubkey", "ownerSignature",
        "ownerIntentHash", "ownerIntentMessage", "nonce", "expiry", "createdAt", "updatedAt",
        "status", "verifierCranker", "submitterCranker", "feeMetadata", "failureReason",
        "onchainSignatures", "displayName", "lookupCommitment", "encryptedIdentityEnvelope",
        "encryptedMasterSeed", "encryptedMetadataHash", "pruConfigurationHash",
        "encryptedPublicRouteEnvelope", "routeVersion", "routeNonce", "tcapRouteVersion",
        "tcapRelationshipCommitment", "tcapRelationshipReference", "tcapPolicyCommitment",
        "creationFeeAmount", "creationFeeMint", "newDisplayName", "newEncryptedMasterSeed",
        "newEncryptedMetadataHash", "newPruConfigurationHash", "newEncryptedPublicRouteEnvelope",
        "newRouteVersion", "newRouteNonce", "updateFeeAmount", "updateFeeMint",
    )
    scalar = (str, int, float, bool, type(None))
    result = {key: payload[key] for key in keys if key in payload and isinstance(payload[key], scalar)}
    if isinstance(payload.get("onchainSignatures"), list) and all(isinstance(value, str) for value in payload["onchainSignatures"]):
        result["onchainSignatures"] = payload["onchainSignatures"]
    return result


def safe_record(record: Any, document_id: str) -> dict[str, Any] | None:
    if not isinstance(record, dict) or record.get("kind") not in {"TIN_OPERATION", "AUTHORIZED_FUNDING", "SETTLEMENT"}:
        return None
    result: dict[str, Any] = {"id": str(record.get("id") or document_id),
                              "kind": record.get("kind"), "status": record.get("status")}
    for key in ("stateVersion", "payloadCommitment", "receivedAt", "updatedAt"):
        value = record.get(key)
        if isinstance(value, (str, int, float, bool, type(None))):
            result[key] = value
    for key in ("nodeLease", "crankerLease"):
        result[key] = safe_lease(record.get(key))
    if record.get("kind") == "TIN_OPERATION":
        result["payload"] = complete_tin_payload(record.get("payload"))
        result["ingressPayloadSummary"] = ingress_payload_summary(record.get("payload"))
    verification = record.get("verification")
    if isinstance(verification, dict):
        scalar = (str, int, float, bool, type(None))
        safe_verification = {
            key: verification[key]
            for key in ("status", "verified", "verificationType", "verifiedAt", "reasonCode", "reason", "hasPublicRouteEnvelope")
            if key in verification and isinstance(verification[key], scalar)
        }
        receiver_lease = verification.get("receiverLease")
        if isinstance(receiver_lease, dict):
            safe_verification["receiverLease"] = {
                key: receiver_lease[key]
                for key in ("source", "owner", "leaseId", "expiresAt", "version", "workId", "kind", "stateVersion", "payloadCommitment")
                if key in receiver_lease and isinstance(receiver_lease[key], scalar)
            }
        verified_payload = verification.get("verifiedPayload")
        if isinstance(verified_payload, dict):
            safe_verification["verifiedPayload"] = complete_verified_tin_payload(verified_payload)
            owner = verified_payload.get("ownerPubkey")
            signature = verified_payload.get("ownerSignature")
            encrypted_seed = verified_payload.get("encryptedMasterSeed")
            safe_verification["verifiedPayloadSummary"] = {
                "intentId": verified_payload.get("intentId"),
                "intentType": verified_payload.get("intentType"),
                "programAssigned": verified_payload.get("programAssigned"),
                "ownerPubkey": owner if isinstance(owner, str) else None,
                "ownerSignaturePresent": isinstance(signature, str) and bool(signature),
                "ownerSignatureBytes": encoded_bytes_length(signature),
                "displayName": verified_payload.get("displayName") if isinstance(verified_payload.get("displayName"), str) else None,
                "encryptedMasterSeedPresent": isinstance(encrypted_seed, str) and bool(encrypted_seed),
                "encryptedMasterSeedBytes": encoded_bytes_length(encrypted_seed),
                "ownerIntentHash": verified_payload.get("ownerIntentHash"),
            }
        if safe_verification:
            result["verification"] = safe_verification
    outcome = record.get("result")
    if isinstance(outcome, dict):
        scalar = (str, int, float, bool, type(None))
        safe_result = {key: outcome[key] for key in
                       ("status", "signature", "transactionSignature", "registryPda", "registry", "confirmedAt", "slot", "errorCode", "tin", "stage")
                       if key in outcome and isinstance(outcome[key], scalar)}
        if safe_result:
            result["result"] = safe_result
    else:
        result["result"] = None
    authorization = record.get("authorization")
    if isinstance(authorization, dict):
        authorization_fields = (
            "leaseId", "leaseVersion", "leaseExpiresAt", "expiresAtTs", "stage", "signature",
            "registry", "tin", "status", "reason", "routeCommitment", "version", "message",
            "signatureBase64", "signerPublicKeyBase64",
        )
        result["authorization"] = {
            key: authorization[key] for key in authorization_fields
            if key in authorization and isinstance(authorization[key], scalar)
        }
    else:
        result["authorization"] = None
    # Retain the explicit TIN protocol payload fields; exclude signing secrets,
    # service credentials, raw database metadata, and arbitrary record fields.
    return result


def receiver_snapshot(store_path: Path, receiver_work_id: str | None) -> dict[str, Any]:
    if not store_path.exists():
        return {"source": str(store_path), "available": False,
                "note": "Local JSON store not found; hosted Receiver records are not read by this tool."}
    try:
        raw = json.loads(store_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        return {"available": False, "error": type(error).__name__}
    collection = os.environ.get("TSN_RECEIVER_COLLECTION", "tsn_receiver_work")
    rows = raw.get(collection, {}) if isinstance(raw, dict) else {}
    if not isinstance(rows, dict):
        rows = {}
    records = [safe_record(value, str(key)) for key, value in rows.items()]
    records = [item for item in records if item is not None and item.get("kind") == "TIN_OPERATION"]
    if receiver_work_id:
        records = [item for item in records if item.get("id") == receiver_work_id]
    else:
        records = sorted(records, key=lambda item: str(item.get("receivedAt") or ""), reverse=True)[:1]
    return {"source": "local-json", "collection": collection, "available": True,
            "count": len(records), "selectedReceiverWorkId": records[0].get("id") if records else None,
            "records": records}


def tin_stage_snapshots(receiver: dict[str, Any]) -> dict[str, Any] | None:
    records = receiver.get("records")
    if not isinstance(records, list) or not records:
        return None
    record = next((item for item in records if isinstance(item, dict) and item.get("kind") == "TIN_OPERATION"), None)
    if not record:
        return None
    received_at = record.get("receivedAt")
    payload = record.get("ingressPayloadSummary") or {}
    verification = record.get("verification") or {}
    lease = verification.get("receiverLease") or {}
    intent_fields = {
        "intentType": payload.get("intentType"),
        "programAssigned": payload.get("programAssigned"),
        "ownerPubkey": payload.get("ownerPubkey"),
        "displayName": payload.get("displayName"),
        "ownerIntentHash": payload.get("ownerIntentHash"),
        "ownerSignature": {"present": payload.get("ownerSignature", {}).get("present"),
                           "encoding": "base64", "decodedBytes": payload.get("ownerSignature", {}).get("decodedBytes")},
        "encryptedMasterSeed": {"present": payload.get("encryptedMasterSeed", {}).get("present"),
                                "encoding": "base64", "decodedBytes": payload.get("encryptedMasterSeed", {}).get("decodedBytes")},
    }
    compact_record = {
        key: record.get(key)
        for key in ("id", "kind", "status", "stateVersion", "payloadCommitment", "receivedAt", "updatedAt")
    }
    compact_record.update({"nodeLease": lease or None,
                           "verificationType": verification.get("verificationType"),
                           "verification": verification,
                           "payload": record.get("payload"),
                           "crankerLease": record.get("crankerLease"), "result": record.get("result")})
    before_node = {
        "captureType": "reconstructed-from-retained-receiver-ingress",
        "id": record.get("id"),
        "kind": record.get("kind"),
        "status": "RECEIVED",
        "stateVersion": 1,
        "payloadCommitment": record.get("payloadCommitment"),
        "updatedAt": received_at,
        # The Receiver persists the accepted ingress body. It is the source for
        # this reconstructed pre-Node snapshot; no separate ingress snapshot was
        # retained, so the manifest labels the reconstruction explicitly.
        "ingressPayload": record.get("payload"),
        "nodeLease": None,
        "crankerLease": None,
        "verification": None,
        "result": None,
    }
    after_node = {
        "stage": "after-node-processing",
        "captureType": "observed-current-receiver-record",
        "record": compact_record,
    }
    before_cranker = {
        "stage": "cranker-input-after-node-verification",
        "captureType": "observed-current-receiver-record",
        "eligibility": "ready" if record.get("status") == "VERIFIED" else "not-ready",
        "record": compact_record,
    }
    if record.get("status") in {"CRANKER_LEASED", "SUBMITTED", "CONFIRMED", "FAILED"} or record.get("result"):
        after_cranker = {
            "stage": "after-cranker-processing",
            "captureType": "observed-current-receiver-record",
            "record": compact_record,
        }
    else:
        after_cranker = {
            "stage": "after-cranker-processing",
            "captureType": "pending-not-captured",
            "status": "NOT_CAPTURED",
            "observedReceiverStatus": record.get("status"),
            "observedCrankerLease": record.get("crankerLease"),
            "observedResult": record.get("result"),
            "requiredEvidence": ["Cranker lease", "Solana transaction signature", "confirmation status", "assigned TIN"],
        }
    return {
        "01-before-node.json": before_node,
        "02-after-node.json": after_node,
        "03-before-cranker.json": before_cranker,
        "04-after-cranker.json": after_cranker,
    }


def cranker_tin_payload(payload: Any) -> dict[str, Any] | None:
    if not isinstance(payload, dict):
        return None
    keys = (
        "intentId", "intentType", "programAssigned", "ownerPubkey", "ownerSignature",
        "ownerIntentHash", "expiry", "nonce", "displayName", "lookupCommitment",
        "encryptedIdentityEnvelope", "encryptedMasterSeed", "encryptedMetadataHash",
        "pruConfigurationHash", "encryptedPublicRouteEnvelope", "routeVersion", "routeNonce",
        "tcapRouteVersion", "tcapRelationshipCommitment", "tcapRelationshipReference", "tcapPolicyCommitment",
    )
    scalar = (str, int, float, bool, type(None))
    return {key: payload[key] for key in keys if key in payload and isinstance(payload[key], scalar)}


def tin_process_evidence(receiver: dict[str, Any]) -> dict[str, Any] | None:
    records = receiver.get("records")
    if not isinstance(records, list) or not records:
        return None
    work = next((item for item in records if isinstance(item, dict) and item.get("kind") == "TIN_OPERATION"), None)
    if not work:
        return None
    payload = work.get("payload") or {}
    verification = work.get("verification") or {}
    verified_payload = verification.get("verifiedPayload") or {}
    receiver_lease = verification.get("receiverLease") or {}
    cranker_lease = work.get("crankerLease")
    cranker_payload = cranker_tin_payload(verified_payload)
    program_assigned = bool((cranker_payload or {}).get("programAssigned"))
    instruction_payload = None
    if cranker_payload and cranker_payload.get("intentType") == "tin_creation":
        instruction_payload = {
            "ownerPubkey": cranker_payload.get("ownerPubkey"),
            "displayName": cranker_payload.get("displayName"),
            "encryptedMasterSeed": cranker_payload.get("encryptedMasterSeed"),
            "encryptedMetadataHash": cranker_payload.get("encryptedMetadataHash"),
            "pruConfigurationHash": "00" * 32 if program_assigned else cranker_payload.get("pruConfigurationHash"),
            "encryptedPublicRouteEnvelope": "" if program_assigned else cranker_payload.get("encryptedPublicRouteEnvelope"),
            "routeVersion": cranker_payload.get("routeVersion"),
            "routeNonce": cranker_payload.get("routeNonce"),
            "tcapRouteVersion": 1 if program_assigned else cranker_payload.get("tcapRouteVersion", 0),
            "tcapRelationshipCommitment": cranker_payload.get("tcapRelationshipCommitment") if program_assigned else "00" * 32,
            "tcapRelationshipReference": cranker_payload.get("tcapRelationshipReference") if program_assigned else "00" * 32,
            "tcapPolicyCommitment": cranker_payload.get("tcapPolicyCommitment") if program_assigned else "00" * 32,
            "nonce": cranker_payload.get("nonce"),
            "intentHash": cranker_payload.get("ownerIntentHash"),
            "expiryTs": cranker_payload.get("expiry"),
        }
    node_expected_version = receiver_lease.get("stateVersion")
    if node_expected_version is not None:
        node_expected_version = int(node_expected_version)
    return {
        "sdkToReceiver": {
            "captureStatus": "RECEIVER_RECORD_OBSERVED",
            "request": {"method": "POST", "path": "/tin-operations", "body": payload},
            "response": {
                "id": work.get("id"), "kind": work.get("kind"), "statusAtIngress": "RECEIVED",
                "stateVersionAtIngress": 1, "payloadCommitment": work.get("payloadCommitment"),
                "receivedAt": work.get("receivedAt"),
            },
            "reconstruction": "The retained record is now VERIFIED; ingress response fields are reconstructed from its immutable record and version history.",
            "encryptedMasterSeedInspection": inspect_seed_envelope(payload.get("encryptedMasterSeed")),
        },
        "receiverToNode": {
            "captureStatus": "NODE_VERIFICATION_OBSERVED",
            "request": {
                "method": "POST", "path": "/api/internal/node/work",
                "bodyShape": {"nodeId": "TSN_NODE_ID (value not retained)", "supportedKinds": ["AUTHORIZED_FUNDING", "TIN_OPERATION"]},
                "credential": "x-api-key omitted; service secret is not evidence data",
            },
            "leasedWork": {
                "id": work.get("id"), "kind": work.get("kind"), "status": "NODE_VERIFYING",
                "stateVersion": receiver_lease.get("stateVersion"),
                "payloadCommitment": work.get("payloadCommitment"), "payload": payload,
                "nodeLease": work.get("nodeLease"),
            },
            "leaseEvidenceReturnedByNode": receiver_lease,
        },
        "nodeVerificationToReceiver": {
            "captureStatus": "VERIFIED" if work.get("status") == "VERIFIED" else work.get("status"),
            "request": {
                "method": "PATCH", "path": "/api/internal/node/work",
                "bodyShape": {
                    "id": work.get("id"), "owner": "Node ID not retained in current Receiver record",
                    "expectedVersion": node_expected_version, "status": work.get("status"),
                    "evidence": verification,
                },
            },
            "receiverRecordAfterPatch": {
                key: work.get(key) for key in ("id", "kind", "status", "stateVersion", "payloadCommitment", "updatedAt", "nodeLease", "verification")
            },
        },
        "receiverToCranker": {
            "captureStatus": "CRANKER_LEASE_OBSERVED" if cranker_lease else "NOT_CAPTURED",
            "request": {
                "method": "POST", "path": "/api/cranker/work",
                "body": {"supportedKinds": ["AUTHORIZED_FUNDING", "SETTLEMENT", "TIN_OPERATION"]},
                "authentication": ["public key", "challenge nonce", "timestamp", "detached signature"],
            },
            "lease": cranker_lease,
            "crankerWorkProjection": {
                "id": work.get("id"), "kind": work.get("kind"), "status": work.get("status"),
                "stateVersion": work.get("stateVersion"), "payload": {},
                "verification": {"verificationType": verification.get("verificationType"), "verifiedPayload": cranker_payload},
            },
            "projectionSource": "Receiver crankerWorkView allowlist applied to the Node-verified payload; no live Cranker claim is present in this record.",
        },
        "crankerToSolana": {
            "captureStatus": "NOT_CAPTURED",
            "input": cranker_payload,
            "encryptedMasterSeedInspection": inspect_seed_envelope(cranker_payload.get("encryptedMasterSeed") if cranker_payload else None),
                "ownerProof": {
                "program": "Ed25519Program", "publicKey": payload.get("ownerPubkey"),
                "message": payload.get("ownerIntentHash"), "signature": payload.get("ownerSignature"),
            },
            "createTinInstruction": {
                "programIdFallback": "TinseNnU588NkmRZBe4ADJbxqrqQma92678UFP6VuwT",
                "programIdEnvironmentKey": "TINS_PROGRAM_ID",
                "registryDerivation": "getTinsIdentityPda(ownerPubkey, programId)",
                "serializedInstructionFields": instruction_payload,
                "accountRoles": [
                    {"role": "cranker signer", "isSigner": True, "isWritable": True},
                    {"role": "TINS global state PDA", "isSigner": False, "isWritable": True},
                    {"role": "owner identity registry PDA", "isSigner": False, "isWritable": True},
                    {"role": "instructions sysvar", "isSigner": False, "isWritable": False},
                    {"role": "System Program", "isSigner": False, "isWritable": False},
                ],
            },
            "rpcCommitment": "confirmed",
            "finalizedSignatureCheck": "Not performed by the Cranker path shown here; pass a real signature to the evidence taker for an RPC status check.",
            "observedTransactionSignature": None,
        },
        "crankerResultToReceiver": {
            "captureStatus": "NOT_CAPTURED",
            "request": {
                "method": "PATCH", "path": "/api/cranker/work",
                "body": {
                    "id": work.get("id"), "owner": (cranker_lease or {}).get("owner"),
                    "expectedVersion": (cranker_lease or {}).get("version"),
                    "status": "CONFIRMED or FAILED", "evidence": work.get("result"),
                },
            },
            "receiverResult": work.get("result"),
            "requiredConfirmedEvidence": {"stage": "TIN_CREATED", "signature": None, "registry": None, "tin": None},
        },
    }


def xml(value: Any) -> str:
    text = str(value if value is not None else "")
    return (text.replace("&", "&amp;").replace("<", "&lt;")
            .replace(">", "&gt;").replace('"', "&quot;").replace("'", "&apos;"))


def json_code_svg(title: str, data: dict[str, Any], *, note: str = "") -> str:
    """Render JSON into one scalable canvas, using adjacent code cards as needed."""
    lines = json.dumps(data, ensure_ascii=False, indent=2).splitlines()
    columns = [lines[index:index + SVG_GRID_ROWS]
               for index in range(0, len(lines), SVG_GRID_ROWS)] or [[]]
    gap = 16
    card_width = (1424 - gap * (len(columns) - 1)) / len(columns)
    card_y, card_h = 194, 622
    code_top, code_bottom = 258, 792
    grid_row_count = max(1, max(len(column) for column in columns))
    grid_line_height = min(34, max(18, int((code_bottom - code_top) / grid_row_count)))
    grid_font_size = min(22, max(13, grid_line_height - 4))
    rendered_cards = []
    line_start = 1
    for column_index, column in enumerate(columns):
        x_card = 88 + column_index * (card_width + gap)
        line_end = line_start + len(column) - 1
        heading = f"JSON · LINES {line_start}–{line_end}" if column_index == 0 else f"JSON CONTINUED · LINES {line_start}–{line_end}"
        # Every card in this image shares one baseline grid and code size so
        # continuation columns align instead of reflowing independently.
        line_height = grid_line_height
        font_size = grid_font_size
        text_x = x_card + 18
        max_width = card_width - 36
        rendered_lines = []
        for line_index, line in enumerate(column):
            y = code_top + line_index * line_height
            key_end = line.find(":")
            indent = len(line) - len(line.lstrip())
            attributes = f'x="{text_x}" y="{y}" font-family="Consolas, Menlo, monospace" font-size="{font_size}" xml:space="preserve"'
            if len(line) * font_size * .61 > max_width:
                attributes += f' textLength="{int(max_width)}" lengthAdjust="spacingAndGlyphs"'
            if line.lstrip().startswith('"') and key_end >= 0:
                key = line[indent:key_end + 1]
                rest = line[key_end + 1:]
                rendered_lines.append(
                    f'<text {attributes}><tspan fill="#90b6a0">{xml(" " * indent + key)}</tspan>'
                    f'<tspan fill="#dce5dc">{xml(rest)}</tspan></text>'
                )
            else:
                color = "#d7e0d7"
                rendered_lines.append(f'<text {attributes} fill="{color}">{xml(line)}</text>')
        rendered_cards.append(
            f'<rect x="{x_card:.1f}" y="{card_y}" width="{card_width:.1f}" height="{card_h}" rx="10" fill="#080e0a" stroke="#24352b"/>'
            f'<text x="{text_x}" y="230" fill="#d7b961" font-family="Consolas, Menlo, monospace" font-size="13" font-weight="700" letter-spacing="1">{xml(heading)}</text>'
            f'{"".join(rendered_lines)}'
        )
        line_start = line_end + 1
    note_svg = (f'<text x="112" y="840" fill="#91a397" font-family="Consolas, Menlo, monospace" '
                f'font-size="13" textLength="{min(1376, max(1, len(note) * 7.2))}" '
                f'lengthAdjust="spacingAndGlyphs">{xml(note)}</text>') if note else ""
    return f'''<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%" viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid meet">
<rect width="1600" height="900" fill="#08100c"/>
<rect x="48" y="42" width="1504" height="816" rx="16" fill="#0d1711" stroke="#293b30" stroke-width="2"/>
<path d="M64 44h1472" stroke="#d7b961" stroke-width="4"/>
<text x="88" y="94" fill="#d7b961" font-family="Consolas, Menlo, monospace" font-size="17" font-weight="700" letter-spacing="2">TSN XP / {xml(CURRENT_FLOW_TITLE.upper())}</text>
<text x="88" y="153" fill="#f1f3ec" font-family="Inter, Segoe UI, Arial, sans-serif" font-size="34" font-weight="700">{xml(title)}</text>
{''.join(rendered_cards)}
{note_svg}
</svg>'''


def write_canvas(out: Path, path: Path, title: str, data: dict[str, Any], note: str) -> list[str]:
    """Replace this canvas and remove page files from the previous renderer."""
    for stale in path.parent.glob(f"{path.stem}-page-*.svg"):
        stale.unlink()
    if path.exists():
        path.unlink()
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json_code_svg(title, data, note=note), encoding="utf-8")
    return [str(path.relative_to(out)).replace("\\", "/")]


def write_stage_svgs(out: Path, stages: dict[str, Any]) -> list[str]:
    titles = {
        "01-before-node.json": ("01 · Receiver ingress before Node", "Reconstructed from retained immutable ingress fields; no pre-Node snapshot was saved."),
        "02-after-node.json": ("02 · Receiver record after Node", "Observed Receiver state after Node verification."),
        "03-before-cranker.json": ("03 · Verified work before Cranker", "Observed Receiver record available for the Cranker claim."),
        "04-after-cranker.json": ("04 · Cranker and Solana result", "NOT_CAPTURED until an actual Cranker lease and finalized Devnet transaction exist."),
    }
    written = []
    for filename, snapshot in stages.items():
        title, note = titles[filename]
        record = snapshot.get("record", snapshot)
        payload = record.get("payload") or snapshot.get("ingressPayload") or {}
        verification = record.get("verification") or {}
        receiver_lease = verification.get("receiverLease") or {}
        verified_payload = verification.get("verifiedPayload") or {}
        if filename == "01-before-node.json":
            data = {
                "id": snapshot.get("id"), "kind": snapshot.get("kind"), "status": snapshot.get("status"),
                "stateVersion": snapshot.get("stateVersion"), "payloadCommitment": snapshot.get("payloadCommitment"),
                "payload": {
                    key: payload.get(key) for key in (
                        "intentType", "programAssigned", "ownerPubkey", "displayName", "ownerIntentHash",
                        "nonce", "expiry", "encryptedMetadataHash", "pruConfigurationHash", "routeVersion",
                        "routeNonce", "tcapRouteVersion", "tcapRelationshipCommitment",
                        "tcapRelationshipReference", "tcapPolicyCommitment",
                    ) if key in payload
                },
                "ownerSignature": {"encoding": "base64", "decodedBytes": encoded_bytes_length(payload.get("ownerSignature"))},
                "encryptedMasterSeed": {"encoding": "base64", "decodedBytes": encoded_bytes_length(payload.get("encryptedMasterSeed"))},
            }
            note += " Full payload values are in 01-before-node.json."
        elif filename in {"02-after-node.json", "03-before-cranker.json"}:
            cranker_fields = cranker_tin_payload(verified_payload)
            visible_cranker_fields = {
                key: value for key, value in (cranker_fields or {}).items()
                if key not in {"ownerSignature", "encryptedMasterSeed"}
            }
            visible_cranker_fields["ownerSignature"] = {
                "encoding": "base64", "decodedBytes": encoded_bytes_length((cranker_fields or {}).get("ownerSignature"))
            }
            visible_cranker_fields["encryptedMasterSeed"] = {
                "encoding": "base64", "decodedBytes": encoded_bytes_length((cranker_fields or {}).get("encryptedMasterSeed"))
            }
            data = {
                "id": record.get("id"), "status": record.get("status"),
                "stateVersion": record.get("stateVersion"), "payloadCommitment": record.get("payloadCommitment"),
                "verificationType": verification.get("verificationType"),
                "receiverLease": receiver_lease, "crankerLease": record.get("crankerLease"),
                "verifiedPayload": visible_cranker_fields,
            }
            note += f" Full process payload and result are in {filename}."
        else:
            observed_record = next((stage.get("record") for stage in stages.values()
                                    if isinstance(stage, dict) and isinstance(stage.get("record"), dict)), {})
            data = {"status": "NOT_CAPTURED", "receiverStatus": snapshot.get("observedReceiverStatus") or observed_record.get("status"),
                    "crankerLease": snapshot.get("observedCrankerLease") or observed_record.get("crankerLease"),
                    "solanaResult": snapshot.get("observedResult"),
                    "requiredNextEvidence": snapshot.get("requiredEvidence")}
        path = out / "tin-creation-stages" / filename.replace(".json", ".svg")
        written.extend(write_canvas(out, path, title, data, note))
    return written


def write_process_svgs(out: Path, process: dict[str, Any]) -> list[str]:
    sdk = process["sdkToReceiver"]
    node_in = process["receiverToNode"]
    node_out = process["nodeVerificationToReceiver"]
    cranker_in = process["receiverToCranker"]
    solana = process["crankerToSolana"]
    cranker_out = process["crankerResultToReceiver"]
    definitions = [
        ("01-sdk-to-receiver.svg", "01 · SDK → Receiver ingress", {
            "method": sdk["request"]["method"], "path": sdk["request"]["path"],
            "receiverWorkId": sdk["response"]["id"], "kind": sdk["response"]["kind"],
            "statusAtIngress": sdk["response"]["statusAtIngress"],
            "stateVersion": sdk["response"]["stateVersionAtIngress"],
            "payloadCommitment": sdk["response"]["payloadCommitment"],
            "bodyFields": list((sdk["request"].get("body") or {}).keys()),
        }, "Full request body is in process-boundaries.json and receiver-evidence.json."),
        ("02-receiver-to-node.svg", "02 · Receiver → Node lease", {
            "method": node_in["request"]["method"], "path": node_in["request"]["path"],
            "supportedKinds": node_in["request"]["bodyShape"]["supportedKinds"],
            "workId": node_in["leasedWork"]["id"], "kind": node_in["leasedWork"]["kind"],
            "leaseStateVersion": node_in["leasedWork"]["stateVersion"],
            "payloadCommitment": node_in["leasedWork"]["payloadCommitment"],
            "leaseEvidenceReturned": node_in["leaseEvidenceReturnedByNode"],
        }, "The Node API key is intentionally omitted from evidence."),
        ("03-node-verification.svg", "03 · Node → Receiver verification", {
            "workId": node_out["receiverRecordAfterPatch"]["id"],
            "status": node_out["receiverRecordAfterPatch"]["status"],
            "stateVersion": node_out["receiverRecordAfterPatch"]["stateVersion"],
            "verificationType": (node_out["receiverRecordAfterPatch"].get("verification") or {}).get("verificationType"),
            "verifiedPayloadFields": list(((node_out["receiverRecordAfterPatch"].get("verification") or {}).get("verifiedPayload") or {}).keys()),
        }, "Complete verifiedPayload and evidence object are in process-boundaries.json."),
        ("04-receiver-to-cranker.svg", "04 · Receiver → Cranker lease", {
            "captureStatus": cranker_in["captureStatus"], "method": cranker_in["request"]["method"],
            "path": cranker_in["request"]["path"], "supportedKinds": cranker_in["request"]["body"]["supportedKinds"],
            "lease": cranker_in["lease"],
            "crankerVerifiedPayloadFields": list((cranker_in["crankerWorkProjection"].get("verification") or {}).get("verifiedPayload", {}).keys()),
        }, "No live Cranker claim is present; exact input projection is in process-boundaries.json."),
        ("05-cranker-to-solana.svg", "05 · Cranker → Solana instruction", {
            "captureStatus": solana["captureStatus"], "programIdFallback": solana["createTinInstruction"]["programIdFallback"],
            "registryDerivation": solana["createTinInstruction"]["registryDerivation"],
            "ownerProofMessage": solana["ownerProof"]["message"],
            "accountRoles": solana["createTinInstruction"]["accountRoles"],
            "rpcCommitment": solana["rpcCommitment"], "transactionSignature": solana["observedTransactionSignature"],
        }, "Instruction fields and values are in process-boundaries.json; no transaction is captured yet."),
        ("06-cranker-result-to-receiver.svg", "06 · Cranker → Receiver result", {
            "captureStatus": cranker_out["captureStatus"], "method": cranker_out["request"]["method"],
            "path": cranker_out["request"]["path"], "requestFields": list(cranker_out["request"]["body"].keys()),
            "receiverResult": cranker_out["receiverResult"],
        }, "No Cranker report, Solana signature, or TIN is claimed."),
    ]
    written = []
    for filename, title, data, note in definitions:
        path = out / "processes" / filename
        written.extend(write_canvas(out, path, title, data, note))
    return written


def write_section_svgs(out: Path, health: dict[str, Any], receiver: dict[str, Any],
                       stages: dict[str, Any], args: argparse.Namespace) -> list[str]:
    record = next((item for item in receiver.get("records", []) if isinstance(item, dict)), {})
    payload = record.get("ingressPayloadSummary", {})
    verification = record.get("verification", {})
    lease = verification.get("receiverLease", {}) if isinstance(verification, dict) else {}
    verification_excerpt = {
        "verificationType": verification.get("verificationType") if isinstance(verification, dict) else None,
        "receiverLease": {key: lease.get(key) for key in ("source", "workId", "kind", "stateVersion", "payloadCommitment")},
    }
    services = health.get("services", {})
    health_excerpt = {
        name: {key: service.get(key) for key in ("httpStatus", "reachable", "result", "status") if key in service}
        for name, service in services.items()
    }
    result = record.get("result")
    sections: list[tuple[str, str, dict[str, Any], str]] = [
        ("01-product-readiness.svg", "01 · Service health", {"network": "solana-devnet", "services": health_excerpt}, "Live endpoint snapshot."),
        ("02-wallet-context.svg", "02 · Owner identity", {
            "ownerPubkey": payload.get("ownerPubkey"), "displayName": payload.get("displayName"),
            "walletAuthorization": "owner signature present" if payload.get("ownerSignature", {}).get("present") else "not captured",
        }, "Selected public identity fields from the signed TIN intent."),
        ("03-create-tin-intent.svg", "03 · SDK TIN intent", {
            "intentType": payload.get("intentType"), "programAssigned": payload.get("programAssigned"),
            "ownerPubkey": payload.get("ownerPubkey"), "displayName": payload.get("displayName"),
            "ownerIntentId": verification.get("verifiedPayloadSummary", {}).get("intentId"),
            "ownerIntentHash": payload.get("ownerIntentHash"),
            "ownerSignature": {"encoding": "base64", "decodedBytes": payload.get("ownerSignature", {}).get("decodedBytes")},
            "encryptedMasterSeed": {"encoding": "base64", "decodedBytes": payload.get("encryptedMasterSeed", {}).get("decodedBytes")},
        }, "Selected fields from the accepted Receiver payload; opaque signature and ciphertext omitted."),
        ("04-receiver-ingress.svg", "04 · Receiver ingress", {
            key: record.get(key) for key in ("id", "kind", "status", "stateVersion", "payloadCommitment", "receivedAt")
        }, "The Receiver is the durable ingress and work record."),
        ("05-node-verification.svg", "05 · Node verification result", {
            "id": record.get("id"), "status": record.get("status"), "stateVersion": record.get("stateVersion"),
            "verification": verification_excerpt,
        }, "Node lease and verification fields returned to the Receiver."),
        ("06-cranker-lease.svg", "06 · Cranker lease", {
            "id": record.get("id"), "eligibleAfterNodeVerification": record.get("status") == "VERIFIED",
            "crankerLease": record.get("crankerLease"),
        }, "Lease is pending until a Cranker actually claims this Receiver work."),
        ("07-solana-finality.svg", "07 · Solana finality", {
            "status": "CAPTURED" if result else "NOT_CAPTURED", "result": result,
            "signatureCheck": "supply --signature after submission" if not args.signature else args.signature,
        }, "No transaction or assigned TIN is claimed before finality."),
        ("08-private-tin-transfer.svg", "08 · Private TIN transfer", {
            "status": "NOT_CAPTURED", "recipient": None, "receiverWork": None, "solanaResult": None,
        }, "This is a separate flow; capture only after a finalized recipient TIN exists."),
        ("09-wallet-transfer-funding.svg", "09 · Wallet transfer and funding", {
            "status": "NOT_CAPTURED", "sdkIntent": None, "receiverWork": None, "solanaResult": None,
        }, "No wallet transfer or funding result is attached to this TIN flow."),
        ("10-sdk-activity.svg", "10 · SDK and Receiver trace", {
            "sdkAction": "createTin", "ownerIntentHash": payload.get("ownerIntentHash"),
            "receiverWorkId": record.get("id"), "receiverStatus": record.get("status"),
            "crankerLease": record.get("crankerLease"), "solanaResult": result,
        }, "One intent ID is kept distinct from the Receiver work ID."),
        ("11-node-recovery.svg", "11 · Node verification checkpoint", {
            "id": record.get("id"), "verification": verification_excerpt,
            "receiverState": record.get("status"), "stateVersion": record.get("stateVersion"),
        }, "Current retained Receiver state after the local lease recovery."),
        ("12-tin-creation-state.svg", "12 · TIN creation state", {
            "id": record.get("id"), "ownerIntentHash": payload.get("ownerIntentHash"),
            "receiverStatus": record.get("status"), "crankerLease": record.get("crankerLease"),
            "solanaResult": result,
        }, "Strongest evidenced state in this flow; update after Cranker and Devnet finality."),
    ]
    written = []
    for filename, title, data, note in sections:
        path = out / "sections" / filename
        written.extend(write_canvas(out, path, title, data, note))
    return written


def extract_log_events(path: Path, needle: str | None) -> dict[str, Any]:
    if not path.exists():
        return {"available": False, "path": str(path)}
    # Copy logs exactly as captured. The collector does not print them to stdout.
    # The manifest warns that operators must review logs before sharing.
    text = path.read_text(encoding="utf-8", errors="replace")
    lines = text.splitlines()
    if needle:
        lines = [line for line in lines if needle in line]
    else:
        keywords = ("lease", "verif", "signature", "TIN", "intent", "CONFIRMED", "submitted", "FAILED", "rejected", "commitment")
        lines = [line for line in lines if any(word.lower() in line.lower() for word in keywords)]
    lines = [redact_log(line) for line in lines]
    return {"available": True, "path": str(path), "matchedLines": len(lines), "lines": lines}


def redact_log(line: str) -> str:
    patterns = [
        (r"(?i)(x-api-key\s*[:=]\s*)[^\s,;]+", r"\1[REDACTED]"),
        (r"(?i)((?:TSN_)?[A-Z0-9_]*(?:PRIVATE_KEY|SECRET|TOKEN|API_KEY)\s*=\s*)[^\s,;]+", r"\1[REDACTED]"),
        (r'(?i)("(?:encryptedMasterSeed|encryptedPublicRouteEnvelope|privateKey|apiKey|secret|ownerSignature|authorization)"\s*:\s*")[^"]*(")', r"\1[REDACTED]\2"),
        (r"(?i)(encrypted(?:masterseed|publicrouteenvelope|payload)\s*[=:]\s*)[^\s,;]+", r"\1[REDACTED]"),
    ]
    for pattern, replacement in patterns:
        line = re.sub(pattern, replacement, line)
    return line[:2000]


def rpc_signature(args: argparse.Namespace, signature: str) -> dict[str, Any]:
    status, body = http_json(args.rpc.rstrip("/"), method="POST", timeout=args.timeout,
                             payload={"jsonrpc": "2.0", "id": 1, "method": "getSignatureStatuses",
                                      "params": [[signature], {"searchTransactionHistory": True}]})
    value = body.get("result", {}).get("value", [None])[0] if isinstance(body, dict) else None
    if not isinstance(value, dict):
        return {"signature": signature, "httpStatus": status,
                "found": False, "rpcError": body.get("error") if isinstance(body, dict) else None}
    return {"signature": signature, "found": True,
            "slot": value.get("slot"), "confirmationStatus": value.get("confirmationStatus"),
            "err": value.get("err"),
            "finalized": value.get("confirmationStatus") == "finalized" and value.get("err") is None,
            "explorer": f"https://explorer.solana.com/tx/{signature}?cluster=devnet"}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out", type=Path, help="Evidence output folder (created if omitted).")
    parser.add_argument("--xp", default="http://127.0.0.1:4317")
    parser.add_argument("--receiver", default="http://127.0.0.1:8010")
    parser.add_argument("--node", default="http://127.0.0.1:8000")
    parser.add_argument("--rpc", default=os.environ.get("TSN_RPC_GATEWAY_URL", DEFAULT_RPC))
    parser.add_argument("--store", type=Path, default=DEFAULT_STORE)
    parser.add_argument("--receiver-work-id", "--intent-id", dest="receiver_work_id",
                        help="Filter evidence to one Receiver work ID (legacy alias: --intent-id).")
    parser.add_argument("--signature", help="Check a Solana signature on the configured Devnet RPC.")
    parser.add_argument("--registry", help="Optional registry PDA to capture public account metadata for.")
    parser.add_argument("--node-log", help="Optional Node log path; matching lines are filtered and secret fields redacted.")
    parser.add_argument("--cranker-log", help="Optional Cranker log path; matching lines are filtered and secret fields redacted.")
    parser.add_argument("--timeout", type=float, default=8.0)
    parser.add_argument("--watch", type=int, default=0, metavar="SECONDS",
                        help="Poll health and Receiver evidence every 3 seconds for this many seconds.")
    args = parser.parse_args()

    out = args.out or DEFAULT_OUT
    out.mkdir(parents=True, exist_ok=True)
    catalog_path = EVIDENCE_ROOT / "flow-catalog.json"
    write_json(catalog_path, {
        "catalogVersion": 1,
        "flows": FLOW_CATALOG,
    })
    manifest: dict[str, Any] = {"network": "solana-devnet",
                                "flowId": CURRENT_FLOW_ID,
                                "flowTitle": CURRENT_FLOW_TITLE,
                                "receiverWorkId": None, "ownerIntentId": None, "signature": args.signature,
                                "sourceMedia": source_media_manifest(),
                                "receiverSource": "tsn-protocol/services/tsn-receiver/.receiver-store.json",
                                "privacy": "complete allowlisted TIN payload and process evidence; arbitrary database fields and service secrets are excluded",
                                "sourceCodeReferences": [
                                    "tsn-protocol/sdks/tsn-sdk/src/tins.ts",
                                    "tsn-protocol/services/tsn-receiver/lib/work-contract.ts",
                                    "tsn-protocol/services/tsn-receiver/app/api/tin-operations/route.ts",
                                    "tsn-protocol/services/tsn-receiver/app/api/internal/node/work/route.ts",
                                    "tsn-protocol/services/tsn-receiver/app/api/cranker/work/route.ts",
                                    "tsn-protocol/services/tsn-node/server.py",
                                    "tsn-protocol/services/tsn-cranker-op-daemon/scripts/cranker.ts",
                                ],
                                "paths": {"flowCatalog": os.path.relpath(catalog_path, out).replace("\\", "/")}}
    health = health_snapshot(args)
    write_json(out / "health.json", health)
    manifest["paths"]["health"] = "health.json"
    receiver = receiver_snapshot(args.store, args.receiver_work_id)
    manifest["receiverWorkId"] = receiver.get("selectedReceiverWorkId")
    selected_record = next((item for item in receiver.get("records", []) if isinstance(item, dict)), {})
    manifest["ownerIntentId"] = (selected_record.get("verification") or {}).get("verifiedPayloadSummary", {}).get("intentId")
    write_json(out / "receiver-evidence.json", receiver)
    manifest["paths"]["receiver"] = "receiver-evidence.json"
    stages = tin_stage_snapshots(receiver)
    if stages:
        for filename, snapshot in stages.items():
            write_json(out / "tin-creation-stages" / filename, snapshot)
        manifest["paths"]["tinStageData"] = [f"tin-creation-stages/{filename}" for filename in stages]
        manifest["paths"]["tinStageCanvases"] = write_stage_svgs(out, stages)
        manifest["paths"]["sectionCanvases"] = write_section_svgs(out, health, receiver, stages, args)
        processes = tin_process_evidence(receiver)
        if processes:
            write_json(out / "process-boundaries.json", processes)
            manifest["paths"]["processBoundaries"] = "process-boundaries.json"
            manifest["paths"]["processCanvases"] = write_process_svgs(out, processes)

    for name, source in (("node", args.node_log), ("cranker", args.cranker_log)):
        if source:
            extracted = extract_log_events(Path(source), args.receiver_work_id)
            if extracted.get("available"):
                write_json(out / f"{name}-events.json", extracted)
                manifest["paths"][name] = f"{name}-events.json"

    if args.signature:
        tx = rpc_signature(args, args.signature)
        write_json(out / "solana-signature.json", tx)
        manifest["paths"]["solana"] = "solana-signature.json"
    if args.registry:
        status, body = http_json(args.rpc.rstrip("/"), method="POST", timeout=args.timeout,
                                 payload={"jsonrpc": "2.0", "id": 2, "method": "getAccountInfo",
                                          "params": [args.registry, {"encoding": "base64", "commitment": "finalized"}]})
        account = body.get("result", {}) if isinstance(body, dict) else {}
        value = account.get("value") if isinstance(account, dict) else None
        registry = {"address": args.registry, "httpStatus": status,
                    "exists": isinstance(value, dict), "slot": account.get("context", {}).get("slot") if isinstance(account, dict) else None}
        if isinstance(value, dict):
            registry.update({key: value.get(key) for key in ("owner", "lamports", "executable")})
            data = value.get("data")
            registry["dataLength"] = len(data[0]) if isinstance(data, list) and data and isinstance(data[0], str) else None
        write_json(out / "solana-registry.json", registry)
        manifest["paths"]["registry"] = "solana-registry.json"

    if args.watch > 0:
        deadline = time.monotonic() + args.watch
        samples = []
        while time.monotonic() < deadline:
            samples.append({"health": health_snapshot(args),
                            "receiver": receiver_snapshot(args.store, args.receiver_work_id)})
            time.sleep(min(3, max(0, deadline - time.monotonic())))
        write_json(out / "timeline.json", samples)
        manifest["paths"]["timeline"] = "timeline.json"

    write_json(out / "manifest.json", manifest)
    print(f"Evidence folder: {out}")
    print(f"Health: {sum(1 for s in health['services'].values() if s['reachable'])}/{len(health['services'])} endpoints responding")
    print(f"Receiver TIN records captured: {receiver.get('count', 0)} (allowlisted payloads)")
    print("Log excerpts are filtered and redacted; review the bundle before sharing it.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
