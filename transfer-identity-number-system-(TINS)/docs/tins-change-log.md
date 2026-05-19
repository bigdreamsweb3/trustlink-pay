# TINS Change Log vs SNS

Short record of what has changed so far.

## 1. Project Positioning

Changed:
- TINS documentation now describes a transfer identity system, not a domain product

TINS:
- name + permanent 10-digit transfer number
- privacy-focused payment routing

SNS:
- domain registration and reverse lookup

## 2. SNS Reference

Changed:
- SNS is now referenced only as the proven Solana architecture behind the starting structure

TINS:
- uses SNS-style registry structure as foundation

SNS:
- is the original naming-service model

## 3. Phase 1 Scope

Changed:
- Phase 1 is now defined as registration, TIN generation, lookup direction, and escrow-first receiving

TINS:
- create identity
- generate permanent TIN
- route funds into escrow

SNS:
- register names and resolve them to account-linked data

## 4. Identity Model

Changed:
- identity moved from name/domain model to number identity model

TINS:
- chosen name
- permanent 10-digit TIN

SNS:
- `.sol` domain identity

## 5. Receiving Model

Changed:
- direct receiving was replaced by escrow-first receiving

TINS:
- sender pays TIN
- funds move to escrow/vault PDA first

SNS:
- resolution is used for direct downstream wallet/account usage

## 6. Phase 1 Instruction Surface

Changed:
- old SNS instruction flow was replaced with TINS Phase 1 instructions

TINS:
- `initialize_program`
- `initialize_identity`
- `create_escrow`
- `claim_escrow`

SNS:
- create domain
- create reverse lookup
- delete domain
- domain-specific creation paths

## 7. On-Chain TIN Generation

Changed:
- added global sequence-based TIN generation with check digit logic

TINS:
- global state PDA
- generated 10-digit TIN
- Luhn-style validation

SNS:
- no transfer-number generation model

## 8. Phase 1 Accounts

Changed:
- added TINS Phase 1 state accounts

TINS:
- global state PDA
- registry PDA
- escrow PDA
- vault PDA

SNS:
- naming and reverse-lookup account model

## 9. Claim Authorization

Changed:
- claim flow is now tied to the receiver authority stored in registry state

TINS:
- receiver main key authorizes claim to destination wallet

SNS:
- not built around escrow claim authorization

## 10. Terminal Testing

Changed:
- added terminal TypeScript harness for Phase 1 testing

TINS:
- test TIN generation
- test PDA derivation
- test instruction payload building

SNS:
- old SNS-specific test flow only

## Quick Comparison

| Area | SNS | TINS |
|---|---|---|
| Identity | Domain/name | Name + 10-digit TIN |
| Receiving | Direct downstream use | Escrow-first |
| Main focus | Naming | Privacy routing |
| Instructions | Domain operations | TIN + escrow operations |
| Testing | SNS flow | TINS terminal harness |
