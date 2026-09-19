---
applyTo: "**/*"
description: "Use when working in this repo's Git workflow, especially subtree pushes to the TSN Protocol remote. Enforce safe git hygiene: fetch and integrate remote updates before pushing, prefer subtree pull/rebase over force-pushes, and validate branch state before commit or publish."
---

# Git workflow guidance for this repository

## Repository roles

This workspace is the TrustLink Pay monorepo, hosted at `bigdreamsweb3/trustlink-pay`.

- `trustlink-pay` is the product/application repo.
- It is the identity-first Solana payment system for sending and receiving crypto using phone numbers and 10-digit TINs instead of wallet addresses.
- WhatsApp handles authentication, business verification, and payment notifications.
- TSN handles privacy-preserving vault routing and settlement logic.

The code under `tsn-protocol/` is a subtree mirror of the separate protocol repo:

- `Trustlink-Labs/TSN-Protocol` is the protocol implementation repo.
- It contains the protocol contracts, SDKs, services, and protocol-specific documentation.
- This repo integrates that code via a Git subtree so the product app can consume the protocol while keeping the protocol repo as its own source of truth.

In short:

- `trustlink-pay` = product shell, app logic, user-facing system
- `TSN-Protocol` = protocol engine and protocol-specific code
- `tsn-protocol/` in this repo = synced subtree copy of the protocol repo

## Required behavior

- Before pushing any protocol change to the TSN Protocol remote, always fetch the remote branch first.
- If Git reports a non-fast-forward rejection, do not force-push without explicit approval.
- Integrate remote updates with a merge or rebase flow before retrying the push.
- Treat the TSN remote as authoritative for protocol code; do not overwrite it without approval.
- Prefer this sequence for subtree work:
  1. `git fetch tsn-protocol main`
  2. `git subtree pull --prefix=tsn-protocol tsn-protocol main --squash`
  3. resolve conflicts if needed
  4. verify `git status --short`
  5. retry the subtree push only after the branch is synchronized
- Keep commits focused and review the working tree before publishing.

## Safe push rules

- Use `git status --short` before commit/push to confirm there are no unexpected files.
- Do not overwrite remote history unless the user explicitly asks for a forced update.
- Treat `non-fast-forward` as a normal sync requirement, not as a signal to bypass remote protections.
- If a subtree push is being done through npm scripts or helper commands, ensure the script includes remote sync before the push step.
- Never treat this repo as the canonical protocol home; the canonical source for protocol changes is `Trustlink-Labs/TSN-Protocol`.

## Repository-specific convention

This repo uses a subtree for the TSN Protocol code under `tsn-protocol/`. The safe working pattern is:

```bash
git fetch tsn-protocol main
git subtree pull --prefix=tsn-protocol tsn-protocol main --squash
git status --short
# then resolve conflicts and retry the publish step
```

If the user explicitly authorizes a force push, document the reason and the exact command used before executing it.
