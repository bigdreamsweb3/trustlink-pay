# TrustLink Pay Frontend Modular Architecture

> **Update reference:** frontend send-flow modularization follow-up after commit `dfa0735` (`TSN: Add settlement-token/OTDT, claim-lease & recovery runtime, and Python cranker daemon`). This document records the component/file map and rules used to keep the React/Next.js codebase maintainable while preserving the TINS, SAS, TSN, Cranker, OTDT, and settlement-token vocabulary.

## Summary

We keep the front-end small, private, and precise. Components render the TrustLink Pay experience; protocol logic belongs in SDK modules, utilities, hooks, or services. TINS identity details stay in identity-governed UI panels. TSN settlement details stay in TSN-governed panels. SAS verification is displayed as trust state without leaking PII. WhatsApp is used only for social confidence verification.

This update starts the modularization of the large send experience by extracting reusable formatting, TIN parsing, recipient-resolution state reset logic, and modal UI into dedicated files. The UI classes and TL/TINS styling remain intact.

---

## Refactored file map

```text
frontend/src/components/experiences/send-experience.tsx
  Purpose: page-level Send orchestration and component-specific state only.
  Imports rendering-only modals and shared send utilities.

frontend/src/components/experiences/send/components/
  confirm-send-modal.tsx
    Purpose: TSN authorization confirmation modal rendering.
    Owns no reusable business logic; receives quote state and callbacks as props.

  country-search-modal.tsx
    Purpose: country picker modal rendering for WhatsApp social confidence resolution.
    Receives filtered countries and selection callback from the page-level flow.

  token-picker-modal.tsx
    Purpose: token picker modal rendering.
    Uses shared send formatter for masked/rounded token balance display.

frontend/src/components/experiences/send/lib/
  send-formatters.ts
    Purpose: send-flow formatting helpers such as payment status labels,
    token balance formatting, and receipt timestamps.

  tin.ts
    Purpose: TINS input parsing and TIN candidate detection.

  recipient-resolution.ts
    Purpose: shared send-flow recipient resolution types and reset logic.

  recipient-lookup-service.ts
    Purpose: API-backed TINS/WhatsApp recipient lookup service and phone verification detail shaping.
```

---

## Component rules

- Page-level experience files may coordinate state, effects, and submission flow.
- Reusable UI elements such as modals must live in `send/components/` or another dedicated component folder.
- Utility functions must live in `send/lib/` or `src/lib/` depending on scope.
- Components must preserve existing Tailwind classes and TL/TINS/TSN palette usage.
- Components must not expose raw wallet addresses, balances, phone numbers, or decrypted TSN data beyond the masked/approved UI already present.
- SDK calls must continue to reflect layer ownership: TINS resolves identity, SAS verifies attestations, TSN creates and settles payment intents.

---

## Implementation notes

### TypeScript components

The extracted modals are pure rendering components:

- `ConfirmSendModal` renders the TSN authorization review state and delegates quote retry/confirm actions to the parent.
- `CountrySearchModal` renders country search results and delegates country selection to the parent so recipient-resolution logic stays centralized.
- `TokenPickerModal` renders supported tokens and delegates selection to the parent so TSN quote invalidation remains explicit.

### Utility modules

- `send-formatters.ts` keeps formatting stable across send components.
- `tin.ts` keeps TINS parsing separate from React rendering.
- `recipient-resolution.ts` centralizes shared types and the recipient resolution reset transition.
- `recipient-lookup-service.ts` keeps API-backed TINS and WhatsApp lookup behavior outside React rendering.

### Python and TSN context

This refactor does not change the Python Cranker daemon or TSN mempool runtime. It keeps the front-end prepared to display TSN state cleanly while the daemon handles Cranker intent work, claim leases, OTDT-gated settlement-token decryption, settlement proofing, and smart recovery.

---

## Security and privacy considerations

- TINS remains the public receive identity; raw wallet addresses are not introduced as primary UI identity.
- SAS verification must be shown as credential/trust state, not PII.
- WhatsApp remains the only social confidence channel.
- TSN settlement quote and authorization details stay in the send confirmation modal.
- OTDT, settlement-token plaintext, Cranker DNA, and recovery internals are not displayed to users.
- Confidential transfer / TF-token behavior remains conceptual and is not wired to live token swaps.

---

## Testing notes

Recommended checks for this refactor:

```bash
npm --prefix frontend run typecheck
```

If the local environment lacks React/Next type packages, the command may fail before reaching this refactor. In that case, verify the changed files with a dependency-complete frontend environment and manually smoke-test:

1. Open Send.
2. Search by TIN and by WhatsApp-backed recipient input.
3. Open and close the country search modal.
4. Select a token from the token picker.
5. Review the TSN authorization modal.
6. Retry a failed quote.
7. Confirm that existing TL/TINS styling is unchanged.
