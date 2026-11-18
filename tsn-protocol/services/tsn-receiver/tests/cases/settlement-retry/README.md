# Settlement retry test components

The `../../settlement-retry.test.mjs` discovery facade retains the authenticated retry scenario and its original assertions. Named components model the version, funding, lease-owner, signing and conflict responses; separate transaction components alter synthetic stored work. Changed funding and settlement snapshots reuse the same compatible helper without merging their distinct fixture contexts.

[CALLBACKS.json](CALLBACKS.json) records original callback ownership and reuse. Shared helpers supply environment capture, module loading and authenticated request construction; the family request adapter preserves its `{ id, expectedVersion: 3 }` default. The scenario passed in the 27-check offline regression run, including preservation of original records, without service startup or live submission.
