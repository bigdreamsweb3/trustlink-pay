# HTTP interfaces and source schemas

**Status: CURRENT source discovery; no HTTP server was started or endpoint exercised by this generator.** This reference lists routes actually declared in the Node and Receiver implementations. The decorator and authorization-symbol references help locate controls but are not a complete authentication analysis; read the handler, middleware and environment policy together.

## Node routes

### POST `/internal/wake`

Handler: `wake_receiver_verification`. [Source: tsn-protocol/services/tsn-node/server.py, line 3456](../../tsn-protocol/services/tsn-node/server.py).

```python
wake_receiver_verification() -> dict[str, Any]
```

Declared route options:

- `dependencies = [Depends(require_worker_api_key)]`

### POST `/internal/settlement-authorizations/settlement`

Handler: `create_settlement_authorization`. [Source: tsn-protocol/services/tsn-node/server.py, line 3550](../../tsn-protocol/services/tsn-node/server.py).

```python
create_settlement_authorization(body: dict[str, Any]) -> dict[str, Any]
```

Declared route options:

- `dependencies = [Depends(require_worker_api_key)]`

### POST `/internal/settlement-authorizations/signature`

Handler: `sign_settlement_transaction`. [Source: tsn-protocol/services/tsn-node/server.py, line 3606](../../tsn-protocol/services/tsn-node/server.py).

```python
sign_settlement_transaction(body: dict[str, Any]) -> dict[str, Any]
```

Declared route options:

- `dependencies = [Depends(require_worker_api_key)]`

### POST `/`

Handler: `mempool_status`. [Source: tsn-protocol/services/tsn-node/server.py, line 3660](../../tsn-protocol/services/tsn-node/server.py).

```python
mempool_status(request: MempoolStatusRequest) -> MempoolStatusResponse
```

Declared route options:

- `response_model = MempoolStatusResponse`

### POST `/threshold-access/nonces/consume`

Handler: `consume_threshold_access_nonce`. [Source: tsn-protocol/services/tsn-node/server.py, line 3669](../../tsn-protocol/services/tsn-node/server.py).

```python
consume_threshold_access_nonce(request: dict[str, Any]) -> dict[str, Any]
```

### POST `/intents`

Handler: `post_intent`. [Source: tsn-protocol/services/tsn-node/server.py, line 3726](../../tsn-protocol/services/tsn-node/server.py).

```python
post_intent(req: CreateIntentRequest) -> PublicMempoolIntent
```

Declared route options:

- `response_model = PublicMempoolIntent`

### GET `/network/recent-blockhash`

Handler: `get_network_recent_blockhash`. [Source: tsn-protocol/services/tsn-node/server.py, line 3769](../../tsn-protocol/services/tsn-node/server.py).

```python
get_network_recent_blockhash() -> dict[str, Any]
```

### GET `/intents`

Handler: `list_intents`. [Source: tsn-protocol/services/tsn-node/server.py, line 3790](../../tsn-protocol/services/tsn-node/server.py).

```python
list_intents(status: Optional[str]=Query(None)) -> list[PublicMempoolIntent]
```

Declared route options:

- `response_model = list[PublicMempoolIntent]`
- `dependencies = [Depends(require_worker_api_key)]`

### PATCH `/intents/{intent_id}/status`

Handler: `update_intent_status`. [Source: tsn-protocol/services/tsn-node/server.py, line 3801](../../tsn-protocol/services/tsn-node/server.py).

```python
update_intent_status(intent_id: str=ApiPath(...), body: UpdateStatusRequest=...) -> MempoolIntent
```

Declared route options:

- `response_model = MempoolIntent`
- `dependencies = [Depends(require_worker_api_key)]`

### GET `/intent-work`

Handler: `list_pending_intent_work`. [Source: tsn-protocol/services/tsn-node/server.py, line 3830](../../tsn-protocol/services/tsn-node/server.py).

```python
list_pending_intent_work(limit: int=Query(50, ge=1, le=500)) -> list[IntentWorkItem]
```

Declared route options:

- `response_model = list[IntentWorkItem]`
- `dependencies = [Depends(require_worker_api_key)]`

### GET `/metrics`

Handler: `get_metrics`. [Source: tsn-protocol/services/tsn-node/server.py, line 3847](../../tsn-protocol/services/tsn-node/server.py).

```python
get_metrics() -> MetricsResponse
```

Declared route options:

- `response_model = MetricsResponse`

### POST `/crankers/heartbeat`

Handler: `post_cranker_heartbeat`. [Source: tsn-protocol/services/tsn-node/server.py, line 3875](../../tsn-protocol/services/tsn-node/server.py).

```python
post_cranker_heartbeat(req: CrankerHeartbeatRequest) -> CrankerHeartbeatRecord
```

Declared route options:

- `response_model = CrankerHeartbeatRecord`
- `dependencies = [Depends(require_worker_api_key)]`

### GET `/settlement-networks`

Handler: `get_settlement_networks`. [Source: tsn-protocol/services/tsn-node/server.py, line 3895](../../tsn-protocol/services/tsn-node/server.py).

```python
get_settlement_networks() -> list[dict[str, Any]]
```

### GET `/network/overview`

Handler: `get_network_overview`. [Source: tsn-protocol/services/tsn-node/server.py, line 3909](../../tsn-protocol/services/tsn-node/server.py).

```python
get_network_overview() -> NetworkOverviewResponse
```

Declared route options:

- `response_model = NetworkOverviewResponse`

### GET `/epoch/status`

Handler: `get_epoch_status`. [Source: tsn-protocol/services/tsn-node/server.py, line 3997](../../tsn-protocol/services/tsn-node/server.py).

```python
get_epoch_status() -> EpochStatus
```

Declared route options:

- `response_model = EpochStatus`

### POST `/epoch/close`

Handler: `close_epoch`. [Source: tsn-protocol/services/tsn-node/server.py, line 4005](../../tsn-protocol/services/tsn-node/server.py).

```python
close_epoch() -> EpochCloseResult
```

Declared route options:

- `response_model = EpochCloseResult`
- `dependencies = [Depends(require_worker_api_key)]`

## Node request and response models

These are declared Pydantic fields, including defaults where present. Runtime validation, aliases and handler-specific errors remain in the linked implementation.

### CreateIntentRequest

[Source: tsn-protocol/services/tsn-node/server.py, line 1431](../../tsn-protocol/services/tsn-node/server.py).

```python
paymentId: str = Field(..., description='Unique payment ID')
intentSeedHash: str = Field(..., description='SHA-256 hex of paymentId')
recipientHash: str = Field(..., description='Hashed recipient')
recipientTin: str = Field(..., description='Recipient TIN used for private settlement routing')
tokenMintAddress: str = Field(..., description='SPL token mint address')
amount: float = Field(..., description='Payment amount')
senderWallet: str = Field(..., description='Wallet that signed the TSN payment authorization')
senderAuthorizationMessage: str = Field(..., description='Canonical TSN payment authorization message')
senderAuthorizationSignature: str = Field(..., description='Wallet signature over the authorization message')
senderAuthorizationNonce: str = Field(..., description='Unique authorization nonce')
senderAuthorizationIssuedAt: Optional[str] = Field(None, description='Authorization issue timestamp')
senderAuthorizationExpiresAt: Optional[str] = Field(None, description='Authorization expiry timestamp')
senderFeeAmount: Optional[float] = Field(None, description='Sender-side protocol fee routed to treasury')
senderSignedFundingTransaction: str = Field(..., description='Owner-signed TCAP private funded-note deposit transaction')
senderFundingMode: Literal['tcap_funded_note_v1'] = Field(..., description='Required proof-bound private funding authority model')
fundingNote: dict[str, Any] = Field(..., repr=False, description='Private note opening restricted to Node verification')
recipientAmount: Optional[float] = Field(None, description='Amount paid to recipient')
destinationNetwork: Optional[str] = Field(None, description='Signed destination settlement network for cross-chain exits')
destinationExecutor: Optional[str] = Field(None, description='Signed destination executor contract for cross-chain exits')
destinationToken: Optional[str] = Field(None, description='Signed destination-chain ERC-20 settlement token')
settlementRouteId: Optional[str] = Field(None, description='Signed registered TSN settlement route')
source: Optional[str] = Field(None)
```

### PublicMempoolIntent

[Source: tsn-protocol/services/tsn-node/server.py, line 1468](../../tsn-protocol/services/tsn-node/server.py).

```python
id: str
paymentId: str
intentSeedHash: str
recipientHash: str
tokenMintAddress: str
amount: float
recipientAmount: Optional[float] = None
source: Optional[str] = None
status: str
assignedCrankerPubkey: Optional[str] = None
fundingTxSig: Optional[str] = None
settlementTxSig: Optional[str] = None
settlementResolution: Optional[str] = None
settlementReason: Optional[str] = None
postedAt: str
updatedAt: str
```

### SignedLeasePermitRequest

[Source: tsn-protocol/services/tsn-node/server.py, line 1496](../../tsn-protocol/services/tsn-node/server.py).

```python
operatorPubkey: str
requestedAtTs: int
requestSignatureBase64: str
```

### IntentWorkItem

[Source: tsn-protocol/services/tsn-node/server.py, line 1501](../../tsn-protocol/services/tsn-node/server.py).

```python
intent: MempoolIntent
```

### UpdateStatusRequest

[Source: tsn-protocol/services/tsn-node/server.py, line 1504](../../tsn-protocol/services/tsn-node/server.py).

```python
status: str = Field(...)
assignedCrankerPubkey: Optional[str] = Field(None)
fundingTxSig: Optional[str] = Field(None)
settlementTxSig: Optional[str] = Field(None)
settlementResolution: Optional[str] = Field(None)
settlementReason: Optional[str] = Field(None)
```

### CrankerHeartbeatRequest

[Source: tsn-protocol/services/tsn-node/server.py, line 1512](../../tsn-protocol/services/tsn-node/server.py).

```python
operator_pubkey: str = Field(...)
cranker_pubkey: Optional[str] = Field(None)
version: Optional[str] = Field(None)
source: Optional[str] = Field(None)
```

### EpochStatus

[Source: tsn-protocol/services/tsn-node/server.py, line 1523](../../tsn-protocol/services/tsn-node/server.py).

```python
epoch_number: int
epoch_started_at: str
next_close_at: str
intent_count: int
settlement_count: int
```

### EpochCloseResult

[Source: tsn-protocol/services/tsn-node/server.py, line 1530](../../tsn-protocol/services/tsn-node/server.py).

```python
epoch_number: int
intents_archived: int
settlements_archived: int
intents_rolled_over: int = 0
intents_pruned: int = 0
settlements_pruned: int = 0
github_commit_url: str
new_epoch_number: int
message: str
```

### MempoolStatusRequest

[Source: tsn-protocol/services/tsn-node/server.py, line 1541](../../tsn-protocol/services/tsn-node/server.py).

```python
action: Optional[str] = Field(default='status')
```

### MempoolStatusResponse

[Source: tsn-protocol/services/tsn-node/server.py, line 1544](../../tsn-protocol/services/tsn-node/server.py).

```python
status: str = 'ok'
epoch: EpochStatus
```

### IntentToSettlementMetrics

[Source: tsn-protocol/services/tsn-node/server.py, line 1548](../../tsn-protocol/services/tsn-node/server.py).

```python
sample_count: int
average_ms: float
min_ms: float
max_ms: float
last_ms: float
updated_at: Optional[str] = None
```

### UptimeMetrics

[Source: tsn-protocol/services/tsn-node/server.py, line 1556](../../tsn-protocol/services/tsn-node/server.py).

```python
service_started_at: str
uptime_seconds: int
uptime_days: float
downtime_events: int = 0
```

### MetricsResponse

[Source: tsn-protocol/services/tsn-node/server.py, line 1562](../../tsn-protocol/services/tsn-node/server.py).

```python
intent_to_settlement: IntentToSettlementMetrics
uptime: UptimeMetrics
active_crankers_last_epoch: int
```

### TokenNetworkStatus

[Source: tsn-protocol/services/tsn-node/server.py, line 1567](../../tsn-protocol/services/tsn-node/server.py).

```python
token_mint: str
token_symbol: Optional[str] = None
token_name: Optional[str] = None
unit_price_usd: Optional[float] = None
vault_token_account: Optional[str] = None
cranker_vault: Optional[str] = None
total_vault_liquidity_units: float = 0
total_vault_liquidity_usd: float = 0
total_vault_liquidity: float = 0
total_intent_amount: float
pending_intent_amount: float
executed_intent_amount: float
vault_liquidity_estimate: float
liquidity_source: str = 'program_scan'
```

### NetworkOverviewResponse

[Source: tsn-protocol/services/tsn-node/server.py, line 1583](../../tsn-protocol/services/tsn-node/server.py).

```python
online_crankers_last_epoch: int
total_crankers_seen: int
total_vault_liquidity_usd: float
total_vault_liquidity: float
tokens: list[TokenNetworkStatus]
```

## Receiver route handlers

Paths below follow the Next.js filesystem router. Application aliases and proxies are configured separately; a Node endpoint is not automatically a Receiver endpoint.

### POST `/api/cranker/auth/challenge`

[Source: tsn-protocol/services/tsn-receiver/app/api/cranker/auth/challenge/route.ts, line 5](../../tsn-protocol/services/tsn-receiver/app/api/cranker/auth/challenge/route.ts).

### POST `/api/cranker/auth/session`

[Source: tsn-protocol/services/tsn-receiver/app/api/cranker/auth/session/route.ts, line 6](../../tsn-protocol/services/tsn-receiver/app/api/cranker/auth/session/route.ts).

### POST `/api/cranker/settlement-signature`

[Source: tsn-protocol/services/tsn-receiver/app/api/cranker/settlement-signature/route.ts, line 10](../../tsn-protocol/services/tsn-receiver/app/api/cranker/settlement-signature/route.ts).

### POST `/api/cranker/wake-token`

[Source: tsn-protocol/services/tsn-receiver/app/api/cranker/wake-token/route.ts, line 13](../../tsn-protocol/services/tsn-receiver/app/api/cranker/wake-token/route.ts).

### POST `/api/cranker/work/retry`

[Source: tsn-protocol/services/tsn-receiver/app/api/cranker/work/retry/route.ts, line 7](../../tsn-protocol/services/tsn-receiver/app/api/cranker/work/retry/route.ts).

### PUT `/api/cranker/work`

[Source: tsn-protocol/services/tsn-receiver/app/api/cranker/work/route.ts, line 10](../../tsn-protocol/services/tsn-receiver/app/api/cranker/work/route.ts).

### POST `/api/cranker/work`

[Source: tsn-protocol/services/tsn-receiver/app/api/cranker/work/route.ts, line 62](../../tsn-protocol/services/tsn-receiver/app/api/cranker/work/route.ts).

### PATCH `/api/cranker/work`

[Source: tsn-protocol/services/tsn-receiver/app/api/cranker/work/route.ts, line 123](../../tsn-protocol/services/tsn-receiver/app/api/cranker/work/route.ts).

### GET `/api/health`

[Source: tsn-protocol/services/tsn-receiver/app/api/health/route.ts, line 7](../../tsn-protocol/services/tsn-receiver/app/api/health/route.ts).

### GET `/api/internal/node/coordination`

[Source: tsn-protocol/services/tsn-receiver/app/api/internal/node/coordination/route.ts, line 5](../../tsn-protocol/services/tsn-receiver/app/api/internal/node/coordination/route.ts).

### POST `/api/internal/node/coordination`

[Source: tsn-protocol/services/tsn-receiver/app/api/internal/node/coordination/route.ts, line 9](../../tsn-protocol/services/tsn-receiver/app/api/internal/node/coordination/route.ts).

### POST `/api/internal/node/state`

[Source: tsn-protocol/services/tsn-receiver/app/api/internal/node/state/route.ts, line 6](../../tsn-protocol/services/tsn-receiver/app/api/internal/node/state/route.ts).

### POST `/api/internal/node/work/reconcile`

[Source: tsn-protocol/services/tsn-receiver/app/api/internal/node/work/reconcile/route.ts, line 6](../../tsn-protocol/services/tsn-receiver/app/api/internal/node/work/reconcile/route.ts).

### POST `/api/internal/node/work/retry`

[Source: tsn-protocol/services/tsn-receiver/app/api/internal/node/work/retry/route.ts, line 6](../../tsn-protocol/services/tsn-receiver/app/api/internal/node/work/retry/route.ts).

### POST `/api/internal/node/work`

[Source: tsn-protocol/services/tsn-receiver/app/api/internal/node/work/route.ts, line 6](../../tsn-protocol/services/tsn-receiver/app/api/internal/node/work/route.ts).

### GET `/api/internal/node/work`

[Source: tsn-protocol/services/tsn-receiver/app/api/internal/node/work/route.ts, line 20](../../tsn-protocol/services/tsn-receiver/app/api/internal/node/work/route.ts).

### PATCH `/api/internal/node/work`

[Source: tsn-protocol/services/tsn-receiver/app/api/internal/node/work/route.ts, line 35](../../tsn-protocol/services/tsn-receiver/app/api/internal/node/work/route.ts).

### PUT `/api/internal/node/work`

[Source: tsn-protocol/services/tsn-receiver/app/api/internal/node/work/route.ts, line 45](../../tsn-protocol/services/tsn-receiver/app/api/internal/node/work/route.ts).

### POST `/api/work`

[Source: tsn-protocol/services/tsn-receiver/app/api/work/route.ts, line 6](../../tsn-protocol/services/tsn-receiver/app/api/work/route.ts).

### GET `/api/work`

[Source: tsn-protocol/services/tsn-receiver/app/api/work/route.ts, line 21](../../tsn-protocol/services/tsn-receiver/app/api/work/route.ts).

### GET `/api/work-status/[id]`

[Source: tsn-protocol/services/tsn-receiver/app/api/work-status/[id]/route.ts, line 9](../../tsn-protocol/services/tsn-receiver/app/api/work-status/[id]/route.ts).

### POST `/intents`

[Source: tsn-protocol/services/tsn-receiver/app/intents/route.ts, line 8](../../tsn-protocol/services/tsn-receiver/app/intents/route.ts).

Handler authorization references: `assertAuthorizedFundingIngress`.

### GET `/intents`

[Source: tsn-protocol/services/tsn-receiver/app/intents/route.ts, line 22](../../tsn-protocol/services/tsn-receiver/app/intents/route.ts).

Handler authorization references: `assertAuthorizedFundingIngress`.

### GET `/tin-operations`

[Source: tsn-protocol/services/tsn-receiver/app/tin-operations/route.ts, line 7](../../tsn-protocol/services/tsn-receiver/app/tin-operations/route.ts).

### POST `/tin-operations`

[Source: tsn-protocol/services/tsn-receiver/app/tin-operations/route.ts, line 11](../../tsn-protocol/services/tsn-receiver/app/tin-operations/route.ts).

## Request, error and retry interpretation

Use the typed SDK contracts for intent construction. Native funding requires the canonical signed payment and exact owner-signed `tcap_funded_note_v1` deposit, with a restricted private opening bound to both wallet approvals. Receiver rejects externally created SETTLEMENT work. Worker APIs use their configured keys/session and lease controls; a public work-status response is a sanitized coordination view.

`TsnHttpClient` throws a plain Error on non-2xx responses and has no automatic retry or timeout. Some Node endpoints return FastAPI `detail` errors, while Receiver routes return their own `error` fields and statuses. No generated OpenAPI availability or uniform rate limit is claimed here. Retry only after distinguishing accepted work from a lost response, and reconcile transaction signatures before reconstructing funding.

See [component records](components.md), [invariants](invariants.md), and the [SDK troubleshooting guide](../../tsn-protocol/tsn-docs/sdk/troubleshooting.mdx).
