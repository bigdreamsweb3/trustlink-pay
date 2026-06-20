# TINS Operator Guide

This guide explains how TINS should be operated and maintained.

## What Is This?

TINS is the Transfer Identity Number System.

It creates and resolves 10-digit payment identities.

## Operator Responsibilities

Operators should make sure:

- TIN records are created correctly
- identity links are encrypted
- verification platform keys are managed safely
- platform key rotation is supported
- invalid or stale proofs are rejected
- user-facing identity data is labeled correctly

## Verification Platforms

A verification platform is a service that signs an identity proof.

TINS can check whether that platform is registered. This allows the protocol to accept proofs from authorized issuers and reject unknown issuers.

## Key Rotation

Verification platforms may need to rotate keys.

The registry should support multiple authorized keys and removal of old keys.

## Security Considerations

- Do not expose sensitive identity data in public accounts.
- Do not treat a TIN alone as legal identity.
- Require explicit user authorization for sensitive field decryption.
- Keep authority keys protected.

## Technical Details

| Item | Path |
| --- | --- |
| Program | `tins-registrar/program/` |
| SDK | `tins-sdk/` |
| Docs | `docs/TINS.md` |
