# Documentation Audit

This file records the documentation modernization pass.

## Goal

The docs now explain the current TrustLink Pay architecture in plain English before implementation details.

The active architecture is:

- Transfer Identity as the portable payment identity layer
- TSN as the settlement layer
- Crankers as settlement operators
- vault liquidity for fast payouts
- epoch-isolated PEA reservoirs
- lightweight `PaymentCommitment` records
- aggregate root commitments
- minimal public challenge release
- PrivacyReceivePDA watch and sweep signaling
- Cranker reputation, slashing direction, and competitive recovery
- proactive epoch creation before handoff

## What Changed

| Document | Why it changed | Obsolete content removed |
| --- | --- | --- |
| `README.md` | Rewritten as the product and repository entry point | Marketing-heavy language and unclear privacy wording |
| `docs/README.md` | Rebuilt as a documentation index | Duplicate historical index wording |
| `docs/START-HERE.md` | Rewritten for non-developers | Experimental/version framing and jargon-first explanation |
| `docs/ARCHITECTURE.md` | Rebuilt around current layers | Old settlement flow wording and direct implementation-first sections |
| `docs/TINS.md` | Rewritten around TIN identity and encrypted links | Confusing legacy identity wording |
| `docs/PROTOCOL.md` | Rewritten as a plain-language protocol overview | Research-style protocol wording |
| `docs/TSN-COMMITMENT-SETTLEMENT.md` | Rewritten around commitments, PEA, roots, and challenges | Older private settlement wording that did not explain why commitments exist |
| `docs/EPOCH-SETTLEMENT.md` | Rewritten as the active epoch settlement guide | Versioned and experimental framing |
| `docs/EPOCH-SETTLEMENT-v1-EXPERIMENTAL.md` | Converted to a compatibility pointer | Active use of “v1 experimental” wording |
| `docs/CRANKER.md` | Rewritten around operator responsibilities | Excess jargon and unclear work types |
| `docs/LIQUIDITY.md` | Rewritten around vaults, PEA, and recovery distribution | Confusing recovery descriptions |
| `docs/SECURITY.md` | Rewritten with honest privacy limits | Overbroad privacy claims |
| `docs/SECURITY-PHILOSOPHY.md` | Simplified into practical product security principles | Essay-style framing |
| `docs/API.md` | Rewritten around backend and mempool API responsibilities | Endpoint-first explanations without context |
| `docs/DEVELOPER.md` | Rewritten as a developer orientation | Duplicate setup guidance |
| `docs/DEPLOYMENT.md` | Updated for the sBPF deploy blocker and buffer cleanup | Ambiguous deploy instructions |
| `docs/INTEGRATION.md` | Rewritten around SDK-first integration | Frontend/manual protocol construction assumptions |
| `docs/FAQ.md` | Rewritten as plain questions | Duplicated explanations |
| `docs/OPPORTUNITY.md` | Simplified around the product opportunity | Hype-style language |
| `docs/META-DATA-USE-COMPLIANCE.md` | Rewritten around data minimization | Unclear metadata handling |
| `docs/WHATSAPP-SEAMLESS-PAY.md` | Rewritten to position WhatsApp as optional | Phone-number-first framing |
| `docs/TINS-OPERATOR.md` | Rewritten for operator responsibilities | Phase or legacy operator wording |
| `docs/submodule-patches/README.md` | Rewritten to clarify patches are handoff artifacts | Treating patch files as active source of truth |
| `backend/README.md` | Rewritten as backend responsibility guide | Duplicate technical detail |
| `frontend/README.md` | Rewritten as frontend responsibility guide | Unclear boundaries between frontend and SDK |
| `tins-registrar/README.md` | Rewritten around active TINS behavior and deploy guard | Long mixed implementation/history notes |
| `tins-registrar/docs/phase-1-scope.md` | Converted to active scope | Phase-based wording |
| `tins-registrar/docs/tins-change-log.md` | Converted to current notes | Historical framing |
| `tsn/README.md` | Rewritten as TSN folder overview | Duplicate architecture notes |
| `tsn/protocol/README.md` | Updated deploy toolchain guidance | Unsafe deploy instructions |
| `tsn/protocol/programs/trustlink-escrow/README.md` | Rewritten as program overview | Sparse implementation-only text |
| `tsn-sdk/README.md` | Rewritten around SDK responsibilities | Missing frontend boundary guidance |
| `tsn-cranker-op-daemon/README.md` | Rewritten around operator daemon behavior | Excess operational ambiguity |
| `tsn-cranker-sdk/README.md` | Rewritten around operator helper scope | Missing reason for SDK |
| `tsn-mempool-backend/README.md` | Rewritten around coordination and privacy | Old endpoint-only wording |
| `tsn-mempool-frontend/README.md` | Rewritten around masked explorer status | Missing privacy display rules |
| `tsn-epoch-records/README.md` | Rewritten around epoch records | Sparse package description |
| `packages/trustlink-whatsapp-sdk/README.md` | Rewritten around optional WhatsApp role | Phone-first identity framing |
| `packages/passkey-wallet/README.md` | Rewritten around passkey boundaries | Unclear wallet/auth separation |
| `public/README.md` | Rewritten with public asset safety rules | Missing secret-handling warning |

## Documentation That Still Needs Architecture Review

These areas should be reviewed again after the next full end-to-end devnet test:

- exact Cranker slashing rules once governance parameters are finalized
- final PrivacyReceivePDA sweep policy
- final wording for sensitive TINS identity decryption
- exact payment status mapping between mempool, backend, and frontend
- final hosted production deployment instructions

## Documentation Rules Going Forward

- Explain the concept before implementation details.
- Do not preserve old experiments as active architecture.
- Avoid “version” language unless a developer migration requires it.
- Do not promise impossible privacy.
- Keep SDK boundaries clear.
- Keep private routes, phone numbers, and decrypted payloads out of examples.
