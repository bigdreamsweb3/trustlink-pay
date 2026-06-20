# Submodule Patch Notes

This folder contains patch handoff files generated during earlier remote work.

The current working tree already applies the useful ideas directly inside the mempool submodules:

- proactive epoch creation
- PEA and epoch status exposure
- private commitment aggregation
- aggregate root status
- minimal public challenge release
- PrivacyReceivePDA watch and sweep signaling
- masked recovery information in the explorer

## Current Source Of Truth

Use the submodule source code and these docs as the active source of truth:

- `tsn-mempool-backend/`
- `tsn-mempool-frontend/`
- [Epoch Settlement](../EPOCH-SETTLEMENT.md)
- [TSN Commitment Settlement](../TSN-COMMITMENT-SETTLEMENT.md)

The patch files are not operational documentation. They are retained only as implementation handoff artifacts.

## Smoke Checks

When the mempool backend is running:

```bash
curl http://localhost:8000/epochs
curl http://localhost:8000/epoch-challenges
curl http://localhost:8000/privacy-receive-watches
curl -X POST http://localhost:8000/epochs/proactive
```

## TSN V1 TINS Cranker Handoff

The mempool submodules are empty/not checked out in this environment. For Cranker-mediated TIN creation and update support, apply these patch handoffs when local Codex has the submodules available:

- `tsn-mempool-backend-tins-cranker-v1.patch`
- `tsn-mempool-frontend-tins-cranker-v1.patch`

See `../TSN-TINS-MEMPOOL-IMPLEMENTATION.md` for the flow, endpoints, fee split, Cranker separation rules, privacy notes, and tests.
