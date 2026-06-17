# TSN Mempool Submodule Patch Handoff

**Version / commit reference:** v1 experimental epoch settlement.

## Summary

`tsn-mempool-backend` and `tsn-mempool-frontend` are separate git submodules. We do not edit their working trees from this main repository. Instead, this folder contains patch files to apply inside each submodule repository.

## Patches

| Patch | Apply inside | Purpose |
| --- | --- | --- |
| `tsn-mempool-backend-epoch-v1.patch` | `tsn-mempool-backend` | Adds automatic epoch creation, private commitment aggregation, minimal challenge release, PrivacyReceivePDA watch state, and epoch APIs. |
| `tsn-mempool-frontend-epoch-v1.patch` | `tsn-mempool-frontend` | Adds an epoch settlement explorer panel showing epochs, PEA references, aggregate roots, challenge status, and recovery winners with masked values. |

## Usage examples

```bash
cd tsn-mempool-backend
git apply ../docs/submodule-patches/tsn-mempool-backend-epoch-v1.patch
npm test
npm run build
```

```bash
cd tsn-mempool-frontend
git apply ../docs/submodule-patches/tsn-mempool-frontend-epoch-v1.patch
npm test
npm run build
```

## Security & privacy considerations

The patches intentionally expose aggregate epoch state only. They do not expose raw TINS routes, phone numbers, raw wallet addresses, full payment graphs, or decrypted OTDT payloads.

## Testing notes

After applying patches in the submodules, smoke-test:

```bash
curl http://localhost:8787/epochs
curl http://localhost:8787/epoch-challenges
curl -X POST http://localhost:8787/epochs/tick
```
