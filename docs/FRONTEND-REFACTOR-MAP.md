# Frontend Modular Refactor Map — Send Experience

> **Update reference:** introduced after commit `64ddea2` to begin converting large React experience files into focused TrustLink Pay modules while preserving the current TL/TINS/TSN visual language.

## Summary

This refactor starts with the TrustLink Pay **Send** experience because it is one of the largest front-end files and contains mixed rendering, formatting, TINS recipient parsing, WhatsApp social-confidence resolution, TSN settlement review state, and modal UI. The goal is to keep the existing UI/UX intact while moving reusable code into files that match their purpose.

The front-end still follows our protocol boundaries:

- **TINS** identity input and 10-digit TIN parsing remain in the send flow.
- **SAS** verification remains a separate trust layer and is not mixed with TSN settlement UI.
- **TSN** settlement review and Cranker-sponsored send behavior remain in TSN-owned panels.
- **Cranker**, **OTDT**, settlement-token, and mempool runtime details remain settlement concepts and are not exposed as raw wallet data in the recipient identity UI.

No new Tailwind classes, colors, or visual patterns were introduced. Existing TL/TINS/TSN classes were preserved.

---

## Refactored file map

```text
frontend/src/components/experiences/send-experience.tsx
  Send page coordinator. Owns page-local state, API orchestration, wallet connection,
  TINS recipient resolution, TSN settlement submission, and composition of child UI.

frontend/src/components/experiences/send/types.ts
  Shared send-experience types:
  - SendFormState
  - SendSuccessState
  - PhoneVerificationDetails
  - RecipientVerificationState
  - ResolvedRecipientLookup

frontend/src/components/experiences/send/components/CountrySearchModal.tsx
  Focused modal for country search and country selection.
  Contains only modal rendering and modal-local event forwarding.

frontend/src/components/experiences/send/components/SendSuccessPanel.tsx
  Focused post-send receipt panel for TSN intent success, WhatsApp receipt state,
  invite sharing, and “send another” action rendering.

frontend/src/components/experiences/send/utils/formatting.ts
  Reusable send formatting helpers:
  - paymentStatusLabel
  - formatTokenBalance
  - formatReceiptTime

frontend/src/components/experiences/send/utils/tin-input.ts
  TINS input helpers:
  - normalizeTinInput
  - looksLikeTinCandidate

frontend/src/components/experiences/send/utils/reset-recipient-resolution.ts
  Shared recipient-resolution reset helper for clearing TINS/WhatsApp preview state.
```

---

## Implementation notes

### Component boundaries

`SendExperience` now imports focused components for:

- country selection modal rendering;
- send-success receipt rendering;
- send-specific formatting;
- TINS candidate parsing;
- recipient-resolution reset behavior.

The extracted components are intentionally small. They receive state and callbacks from the page coordinator instead of reaching into global state or duplicating TSN/TINS logic.

### TINS input handling

TIN parsing moved into `send/utils/tin-input.ts`. This keeps the parsing and check-digit logic reusable while leaving the `SendExperience` component responsible only for deciding when to call it.

### Country search modal

The country search modal moved into its own component file. It preserves the existing modal layout, TL field styling, country list behavior, and active-country highlight.

### Send success panel

The send success panel moved into its own component file. It preserves:

- TSN intent success messaging;
- WhatsApp receipt display;
- manual invite display;
- invite sharing;
- “Back home” and “Send another” actions.

The panel does not expose raw wallets or balances. It continues to mask transaction-like references through existing UI behavior.

---

## Security and privacy considerations

- The refactor does not add new wallet, balance, phone, or settlement-token display surfaces.
- TINS identity input remains the public payment identity surface.
- WhatsApp remains the only social-confidence channel.
- TSN settlement state remains in the send/settlement review area and is not mixed into unrelated identity panels.
- The UI continues to avoid displaying raw recipient wallet addresses.
- Confidential transfer / TF-token flows remain conceptual and are not wired to live token accounts.

---

## Testing notes

The intended checks for this refactor are:

```bash
npm --prefix frontend run typecheck
```

In the current container, frontend dependencies are not installed and `npm --prefix frontend install` is blocked by an npm registry `403` for `@solana/spl-token`, so typechecking cannot complete in this environment. The refactor was kept to import-safe TypeScript/React module extraction with existing class names preserved.

Manual review checklist:

1. Open the Send page.
2. Verify TINS and WhatsApp recipient entry still resolves.
3. Open and close the country selector.
4. Select a country and confirm the previous retry behavior remains.
5. Review a TSN send.
6. Confirm the success panel still displays receipt state and invite sharing.
7. Confirm no raw recipient wallet, sender wallet, balance, phone registry data, OTDT, or decrypted settlement-token material is newly exposed.
