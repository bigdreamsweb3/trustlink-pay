---
applyTo: "**/*"
description: "Use when working in this repo's Git workflow, especially subtree pushes to the TSN Protocol remote. Enforce safe git hygiene: fetch and integrate remote updates before pushing, prefer subtree pull/rebase over force-pushes, and validate branch state before commit or publish."
---

# Git workflow guidance for this repository

## Required behavior

- Before pushing a subtree change to the TSN Protocol remote, always fetch the remote branch first.
- If Git reports a non-fast-forward rejection, do not force-push without explicit approval.
- Integrate remote updates with a merge or rebase flow before retrying the push.
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

## Repository-specific convention

This repo uses a subtree for the TSN Protocol code under `tsn-protocol/`. The safe working pattern is:

```bash
git fetch tsn-protocol main
git subtree pull --prefix=tsn-protocol tsn-protocol main --squash
git status --short
# then resolve conflicts and retry the publish step
```

If the user explicitly authorizes a force push, document the reason and the exact command used before executing it.
