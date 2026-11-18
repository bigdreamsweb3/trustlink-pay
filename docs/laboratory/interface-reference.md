# HTTP interfaces and source schemas

**Status: CURRENT source discovery; no HTTP server was started or endpoint exercised by this generator.** This reference lists routes actually declared in the Node and Receiver implementations. The decorator and authorization-symbol references help locate controls but are not a complete authentication analysis; read the handler, middleware and environment policy together.

## Node routes

### POST `/internal/wake`

Handler: `wake_receiver_verification`. [Source: tsn-protocol/services/tsn-node/api/handlers/wake_receiver_verification.py, line 20](../../tsn-protocol/services/tsn-node/api/handlers/wake_receiver_verification.py). Registration: [Source: tsn-protocol/services/tsn-node/server.py, line 331](../../tsn-protocol/services/tsn-node/server.py).

```python
wake_receiver_verification() -> dict[str, Any]
```

The displayed HTTP signature omits the bound runtime dependency port; the implementation signature remains in the inventory.

Declared route options:

- `dependencies = [Depends(require_worker_api_key)]`

### POST `/internal/settlement-authorizations/settlement`

Handler: `create_settlement_authorization`. [Source: tsn-protocol/services/tsn-node/api/handlers/create_settlement_authorization.py, line 34](../../tsn-protocol/services/tsn-node/api/handlers/create_settlement_authorization.py). Registration: [Source: tsn-protocol/services/tsn-node/server.py, line 333](../../tsn-protocol/services/tsn-node/server.py).

```python
create_settlement_authorization(body: dict[str, Any]) -> dict[str, Any]
```

The displayed HTTP signature omits the bound runtime dependency port; the implementation signature remains in the inventory.

Declared route options:

- `dependencies = [Depends(require_worker_api_key)]`

### POST `/internal/settlement-authorizations/signature`

Handler: `sign_settlement_transaction`. [Source: tsn-protocol/services/tsn-node/transactions/native/signing/sign_settlement_transaction.py, line 29](../../tsn-protocol/services/tsn-node/transactions/native/signing/sign_settlement_transaction.py). Registration: [Source: tsn-protocol/services/tsn-node/server.py, line 334](../../tsn-protocol/services/tsn-node/server.py).

```python
sign_settlement_transaction(body: dict[str, Any]) -> dict[str, Any]
```

The displayed HTTP signature omits the bound runtime dependency port; the implementation signature remains in the inventory.

Declared route options:

- `dependencies = [Depends(require_worker_api_key)]`

### POST `/`

Handler: `mempool_status`. [Source: tsn-protocol/services/tsn-node/api/handlers/mempool_status.py, line 15](../../tsn-protocol/services/tsn-node/api/handlers/mempool_status.py). Registration: [Source: tsn-protocol/services/tsn-node/server.py, line 335](../../tsn-protocol/services/tsn-node/server.py).

```python
mempool_status(request: MempoolStatusRequest) -> MempoolStatusResponse
```

The displayed HTTP signature omits the bound runtime dependency port; the implementation signature remains in the inventory.

Declared route options:

- `response_model = MempoolStatusResponse`

### POST `/threshold-access/nonces/consume`

Handler: `consume_threshold_access_nonce`. [Source: tsn-protocol/services/tsn-node/api/handlers/consume_threshold_access_nonce.py, line 27](../../tsn-protocol/services/tsn-node/api/handlers/consume_threshold_access_nonce.py). Registration: [Source: tsn-protocol/services/tsn-node/server.py, line 336](../../tsn-protocol/services/tsn-node/server.py).

```python
consume_threshold_access_nonce(request: dict[str, Any]) -> dict[str, Any]
```

The displayed HTTP signature omits the bound runtime dependency port; the implementation signature remains in the inventory.

### POST `/intents`

Handler: `post_intent`. [Source: tsn-protocol/services/tsn-node/api/handlers/post_intent.py, line 22](../../tsn-protocol/services/tsn-node/api/handlers/post_intent.py). Registration: [Source: tsn-protocol/services/tsn-node/server.py, line 337](../../tsn-protocol/services/tsn-node/server.py).

```python
post_intent(req: CreateIntentRequest) -> PublicMempoolIntent
```

The displayed HTTP signature omits the bound runtime dependency port; the implementation signature remains in the inventory.

Declared route options:

- `response_model = PublicMempoolIntent`

### GET `/network/recent-blockhash`

Handler: `get_network_recent_blockhash`. [Source: tsn-protocol/services/tsn-node/api/handlers/get_network_recent_blockhash.py, line 24](../../tsn-protocol/services/tsn-node/api/handlers/get_network_recent_blockhash.py). Registration: [Source: tsn-protocol/services/tsn-node/server.py, line 338](../../tsn-protocol/services/tsn-node/server.py).

```python
get_network_recent_blockhash() -> dict[str, Any]
```

The displayed HTTP signature omits the bound runtime dependency port; the implementation signature remains in the inventory.

### POST `/network/funding/readiness`

Handler: `post_funding_readiness`. [Source: tsn-protocol/services/tsn-node/api/handlers/post_funding_readiness.py, line 18](../../tsn-protocol/services/tsn-node/api/handlers/post_funding_readiness.py). Registration: [Source: tsn-protocol/services/tsn-node/server.py, line 339](../../tsn-protocol/services/tsn-node/server.py).

```python
post_funding_readiness(request: FundingReadinessRequest) -> dict[str, Any]
```

The displayed HTTP signature omits the bound runtime dependency port; the implementation signature remains in the inventory.

### POST `/network/funding/complete`

Handler: `post_complete_funding`. [Source: tsn-protocol/services/tsn-node/api/handlers/post_complete_funding.py, line 28](../../tsn-protocol/services/tsn-node/api/handlers/post_complete_funding.py). Registration: [Source: tsn-protocol/services/tsn-node/server.py, line 340](../../tsn-protocol/services/tsn-node/server.py).

```python
post_complete_funding(request: CompleteFundingRequest) -> dict[str, Any]
```

The displayed HTTP signature omits the bound runtime dependency port; the implementation signature remains in the inventory.

### GET `/intents`

Handler: `list_intents`. [Source: tsn-protocol/services/tsn-node/api/handlers/list_intents.py, line 22](../../tsn-protocol/services/tsn-node/api/handlers/list_intents.py). Registration: [Source: tsn-protocol/services/tsn-node/server.py, line 341](../../tsn-protocol/services/tsn-node/server.py).

```python
list_intents(status: Optional[str]=Query(None)) -> list[PublicMempoolIntent]
```

The displayed HTTP signature omits the bound runtime dependency port; the implementation signature remains in the inventory.

Declared route options:

- `response_model = list[PublicMempoolIntent]`
- `dependencies = [Depends(require_worker_api_key)]`

### PATCH `/intents/{intent_id}/status`

Handler: `update_intent_status`. [Source: tsn-protocol/services/tsn-node/api/handlers/update_intent_status.py, line 22](../../tsn-protocol/services/tsn-node/api/handlers/update_intent_status.py). Registration: [Source: tsn-protocol/services/tsn-node/server.py, line 342](../../tsn-protocol/services/tsn-node/server.py).

```python
update_intent_status(intent_id: str=ApiPath(...), body: UpdateStatusRequest=...) -> MempoolIntent
```

The displayed HTTP signature omits the bound runtime dependency port; the implementation signature remains in the inventory.

Declared route options:

- `response_model = MempoolIntent`
- `dependencies = [Depends(require_worker_api_key)]`

### GET `/intent-work`

Handler: `list_pending_intent_work`. [Source: tsn-protocol/services/tsn-node/api/handlers/list_pending_intent_work.py, line 20](../../tsn-protocol/services/tsn-node/api/handlers/list_pending_intent_work.py). Registration: [Source: tsn-protocol/services/tsn-node/server.py, line 343](../../tsn-protocol/services/tsn-node/server.py).

```python
list_pending_intent_work(limit: int=Query(50, ge=1, le=500)) -> list[IntentWorkItem]
```

The displayed HTTP signature omits the bound runtime dependency port; the implementation signature remains in the inventory.

Declared route options:

- `response_model = list[IntentWorkItem]`
- `dependencies = [Depends(require_worker_api_key)]`

### GET `/metrics`

Handler: `get_metrics`. [Source: tsn-protocol/services/tsn-node/api/handlers/get_metrics.py, line 21](../../tsn-protocol/services/tsn-node/api/handlers/get_metrics.py). Registration: [Source: tsn-protocol/services/tsn-node/server.py, line 344](../../tsn-protocol/services/tsn-node/server.py).

```python
get_metrics() -> MetricsResponse
```

The displayed HTTP signature omits the bound runtime dependency port; the implementation signature remains in the inventory.

Declared route options:

- `response_model = MetricsResponse`

### POST `/crankers/heartbeat`

Handler: `post_cranker_heartbeat`. [Source: tsn-protocol/services/tsn-node/api/handlers/post_cranker_heartbeat.py, line 20](../../tsn-protocol/services/tsn-node/api/handlers/post_cranker_heartbeat.py). Registration: [Source: tsn-protocol/services/tsn-node/server.py, line 345](../../tsn-protocol/services/tsn-node/server.py).

```python
post_cranker_heartbeat(req: CrankerHeartbeatRequest) -> CrankerHeartbeatRecord
```

The displayed HTTP signature omits the bound runtime dependency port; the implementation signature remains in the inventory.

Declared route options:

- `response_model = CrankerHeartbeatRecord`
- `dependencies = [Depends(require_worker_api_key)]`

### GET `/settlement-networks`

Handler: `get_settlement_networks`. [Source: tsn-protocol/services/tsn-node/api/handlers/get_settlement_networks.py, line 17](../../tsn-protocol/services/tsn-node/api/handlers/get_settlement_networks.py). Registration: [Source: tsn-protocol/services/tsn-node/server.py, line 346](../../tsn-protocol/services/tsn-node/server.py).

```python
get_settlement_networks() -> list[dict[str, Any]]
```

The displayed HTTP signature omits the bound runtime dependency port; the implementation signature remains in the inventory.

### GET `/network/overview`

Handler: `get_network_overview`. [Source: tsn-protocol/services/tsn-node/api/handlers/get_network_overview.py, line 26](../../tsn-protocol/services/tsn-node/api/handlers/get_network_overview.py). Registration: [Source: tsn-protocol/services/tsn-node/server.py, line 347](../../tsn-protocol/services/tsn-node/server.py).

```python
get_network_overview() -> NetworkOverviewResponse
```

The displayed HTTP signature omits the bound runtime dependency port; the implementation signature remains in the inventory.

Declared route options:

- `response_model = NetworkOverviewResponse`

### GET `/epoch/status`

Handler: `get_epoch_status`. [Source: tsn-protocol/services/tsn-node/api/handlers/get_epoch_status.py, line 14](../../tsn-protocol/services/tsn-node/api/handlers/get_epoch_status.py). Registration: [Source: tsn-protocol/services/tsn-node/server.py, line 348](../../tsn-protocol/services/tsn-node/server.py).

```python
get_epoch_status() -> EpochStatus
```

The displayed HTTP signature omits the bound runtime dependency port; the implementation signature remains in the inventory.

Declared route options:

- `response_model = EpochStatus`

### POST `/epoch/close`

Handler: `close_epoch`. [Source: tsn-protocol/services/tsn-node/api/handlers/close_epoch.py, line 16](../../tsn-protocol/services/tsn-node/api/handlers/close_epoch.py). Registration: [Source: tsn-protocol/services/tsn-node/server.py, line 349](../../tsn-protocol/services/tsn-node/server.py).

```python
close_epoch() -> EpochCloseResult
```

The displayed HTTP signature omits the bound runtime dependency port; the implementation signature remains in the inventory.

Declared route options:

- `response_model = EpochCloseResult`
- `dependencies = [Depends(require_worker_api_key)]`

## Node request and response models

These are statically discovered Pydantic fields, including inherited fields and defaults where present. The inventory retains each field's declaring class and source. Model configuration is inherited through the local class graph; runtime validation, aliases and handler-specific errors remain in the linked implementation.

### CompleteFundingRequest

[Source: tsn-protocol/services/tsn-node/core/schemas/complete_funding_request.py, line 7](../../tsn-protocol/services/tsn-node/core/schemas/complete_funding_request.py).

Inherited model sources: `FundingReadinessRequest` ([Source: tsn-protocol/services/tsn-node/core/schemas/funding_readiness_request.py, line 5](../../tsn-protocol/services/tsn-node/core/schemas/funding_readiness_request.py)).

```python
model_config = ConfigDict(extra='forbid')
workId: str = Field(..., min_length=1, max_length=128)
senderPubkey: str = Field(..., min_length=32, max_length=44)
authorizationSignature: str = Field(..., repr=False, min_length=1, max_length=128)
expectedStateVersion: int = Field(..., strict=True, gt=0)
authorizationPayloadCommitment: str = Field(..., pattern='^[0-9a-f]{64}$')
senderFundingDepositTxB64: str = Field(..., repr=False, min_length=1, max_length=5464)
senderFundingBlockhashContext: SenderFundingBlockhashContext
```

### ConfirmedFundingRequest

[Source: tsn-protocol/services/tsn-node/core/schemas/confirmed_funding_request.py, line 11](../../tsn-protocol/services/tsn-node/core/schemas/confirmed_funding_request.py).

Inherited model sources: `PaymentAuthorizationFields` ([Source: tsn-protocol/services/tsn-node/core/schemas/payment_authorization_fields.py, line 7](../../tsn-protocol/services/tsn-node/core/schemas/payment_authorization_fields.py)).

```python
model_config = ConfigDict(extra='forbid')
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
senderFundingMode: Literal['tcap_funded_note_v1'] = Field(..., description='Required proof-bound private funding authority model')
fundingNote: dict[str, Any] = Field(..., repr=False, description='Private note opening restricted to Node verification')
recipientAmount: Optional[float] = Field(None, description='Amount paid to recipient')
destinationNetwork: Optional[str] = Field(None, description='Signed destination settlement network for cross-chain exits')
destinationExecutor: Optional[str] = Field(None, description='Signed destination executor contract for cross-chain exits')
destinationToken: Optional[str] = Field(None, description='Signed destination-chain ERC-20 settlement token')
settlementRouteId: Optional[str] = Field(None, description='Signed registered TSN settlement route')
source: Optional[str] = Field(None)
senderSignedFundingTransaction: str = Field(..., description='Original owner-signed deposit retained for receipt verification')
senderFundingBlockhashContext: Optional[dict[str, Any]] = Field(None, repr=False, description='Retained RPC hint unused by confirmed receipt verification')
```

### CrankerHeartbeatRecord

[Source: tsn-protocol/services/tsn-node/core/schemas/cranker_heartbeat_record.py, line 4](../../tsn-protocol/services/tsn-node/core/schemas/cranker_heartbeat_record.py).

Inherited model sources: `CrankerHeartbeatRequest` ([Source: tsn-protocol/services/tsn-node/core/schemas/cranker_heartbeat_request.py, line 6](../../tsn-protocol/services/tsn-node/core/schemas/cranker_heartbeat_request.py)).

```python
operator_pubkey: str = Field(...)
cranker_pubkey: Optional[str] = Field(None)
version: Optional[str] = Field(None)
source: Optional[str] = Field(None)
first_seen_at: str
last_seen_at: str
online: bool = True
```

### CrankerHeartbeatRequest

[Source: tsn-protocol/services/tsn-node/core/schemas/cranker_heartbeat_request.py, line 6](../../tsn-protocol/services/tsn-node/core/schemas/cranker_heartbeat_request.py).

```python
operator_pubkey: str = Field(...)
cranker_pubkey: Optional[str] = Field(None)
version: Optional[str] = Field(None)
source: Optional[str] = Field(None)
```

### CreateIntentRequest

[Source: tsn-protocol/services/tsn-node/core/schemas/create_intent_request.py, line 5](../../tsn-protocol/services/tsn-node/core/schemas/create_intent_request.py).

Inherited model sources: `PaymentAuthorizationFields` ([Source: tsn-protocol/services/tsn-node/core/schemas/payment_authorization_fields.py, line 7](../../tsn-protocol/services/tsn-node/core/schemas/payment_authorization_fields.py)).

```python
model_config = ConfigDict(extra='forbid')
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
senderFundingMode: Literal['tcap_funded_note_v1'] = Field(..., description='Required proof-bound private funding authority model')
fundingNote: dict[str, Any] = Field(..., repr=False, description='Private note opening restricted to Node verification')
recipientAmount: Optional[float] = Field(None, description='Amount paid to recipient')
destinationNetwork: Optional[str] = Field(None, description='Signed destination settlement network for cross-chain exits')
destinationExecutor: Optional[str] = Field(None, description='Signed destination executor contract for cross-chain exits')
destinationToken: Optional[str] = Field(None, description='Signed destination-chain ERC-20 settlement token')
settlementRouteId: Optional[str] = Field(None, description='Signed registered TSN settlement route')
source: Optional[str] = Field(None)
```

### EpochCloseResult

[Source: tsn-protocol/services/tsn-node/core/schemas/epoch_close_result.py, line 4](../../tsn-protocol/services/tsn-node/core/schemas/epoch_close_result.py).

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

### EpochStatus

[Source: tsn-protocol/services/tsn-node/core/schemas/epoch_status.py, line 4](../../tsn-protocol/services/tsn-node/core/schemas/epoch_status.py).

```python
epoch_number: int
epoch_started_at: str
next_close_at: str
intent_count: int
settlement_count: int
```

### FundingReadinessRequest

[Source: tsn-protocol/services/tsn-node/core/schemas/funding_readiness_request.py, line 5](../../tsn-protocol/services/tsn-node/core/schemas/funding_readiness_request.py).

```python
model_config = ConfigDict(extra='forbid')
workId: str = Field(..., min_length=1, max_length=128)
senderPubkey: str = Field(..., min_length=32, max_length=44)
authorizationSignature: str = Field(..., repr=False, min_length=1, max_length=128)
```

### IntentToSettlementMetrics

[Source: tsn-protocol/services/tsn-node/core/schemas/intent_to_settlement_metrics.py, line 5](../../tsn-protocol/services/tsn-node/core/schemas/intent_to_settlement_metrics.py).

```python
sample_count: int
average_ms: float
min_ms: float
max_ms: float
last_ms: float
updated_at: Optional[str] = None
```

### IntentWorkItem

[Source: tsn-protocol/services/tsn-node/core/schemas/intent_work_item.py, line 5](../../tsn-protocol/services/tsn-node/core/schemas/intent_work_item.py).

```python
intent: MempoolIntent
```

### MempoolIntent

[Source: tsn-protocol/services/tsn-node/core/schemas/mempool_intent.py, line 5](../../tsn-protocol/services/tsn-node/core/schemas/mempool_intent.py).

Inherited model sources: `ConfirmedFundingRequest` ([Source: tsn-protocol/services/tsn-node/core/schemas/confirmed_funding_request.py, line 11](../../tsn-protocol/services/tsn-node/core/schemas/confirmed_funding_request.py)).

```python
model_config = ConfigDict(extra='forbid')
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
senderFundingMode: Literal['tcap_funded_note_v1'] = Field(..., description='Required proof-bound private funding authority model')
fundingNote: dict[str, Any] = Field(..., repr=False, description='Private note opening restricted to Node verification')
recipientAmount: Optional[float] = Field(None, description='Amount paid to recipient')
destinationNetwork: Optional[str] = Field(None, description='Signed destination settlement network for cross-chain exits')
destinationExecutor: Optional[str] = Field(None, description='Signed destination executor contract for cross-chain exits')
destinationToken: Optional[str] = Field(None, description='Signed destination-chain ERC-20 settlement token')
settlementRouteId: Optional[str] = Field(None, description='Signed registered TSN settlement route')
source: Optional[str] = Field(None)
senderSignedFundingTransaction: str = Field(..., description='Original owner-signed deposit retained for receipt verification')
senderFundingBlockhashContext: Optional[dict[str, Any]] = Field(None, repr=False, description='Retained RPC hint unused by confirmed receipt verification')
id: str
status: str = 'pending'
assignedCrankerPubkey: Optional[str] = None
fundingTxSig: Optional[str] = None
settlementTxSig: Optional[str] = None
settlementResolution: Optional[str] = None
settlementReason: Optional[str] = None
postedAt: str
updatedAt: str
```

### MempoolStatusRequest

[Source: tsn-protocol/services/tsn-node/core/schemas/mempool_status_request.py, line 6](../../tsn-protocol/services/tsn-node/core/schemas/mempool_status_request.py).

```python
action: Optional[str] = Field(default='status')
```

### MempoolStatusResponse

[Source: tsn-protocol/services/tsn-node/core/schemas/mempool_status_response.py, line 5](../../tsn-protocol/services/tsn-node/core/schemas/mempool_status_response.py).

```python
status: str = 'ok'
epoch: EpochStatus
```

### MetricsResponse

[Source: tsn-protocol/services/tsn-node/core/schemas/metrics_response.py, line 6](../../tsn-protocol/services/tsn-node/core/schemas/metrics_response.py).

```python
intent_to_settlement: IntentToSettlementMetrics
uptime: UptimeMetrics
active_crankers_last_epoch: int
```

### NetworkOverviewResponse

[Source: tsn-protocol/services/tsn-node/core/schemas/network_overview_response.py, line 5](../../tsn-protocol/services/tsn-node/core/schemas/network_overview_response.py).

```python
online_crankers_last_epoch: int
total_crankers_seen: int
total_vault_liquidity_usd: float
total_vault_liquidity: float
tokens: list[TokenNetworkStatus]
```

### PaymentAuthorizationFields

[Source: tsn-protocol/services/tsn-node/core/schemas/payment_authorization_fields.py, line 7](../../tsn-protocol/services/tsn-node/core/schemas/payment_authorization_fields.py).

```python
model_config = ConfigDict(extra='forbid')
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

[Source: tsn-protocol/services/tsn-node/core/schemas/public_mempool_intent.py, line 5](../../tsn-protocol/services/tsn-node/core/schemas/public_mempool_intent.py).

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

### SenderFundingBlockhashContext

[Source: tsn-protocol/services/tsn-node/core/schemas/sender_funding_blockhash_context.py, line 5](../../tsn-protocol/services/tsn-node/core/schemas/sender_funding_blockhash_context.py).

```python
model_config = ConfigDict(extra='forbid')
blockhash: str = Field(..., strict=True, min_length=32, max_length=44)
lastValidBlockHeight: int = Field(..., strict=True, gt=0, le=9007199254740991)
contextSlot: int = Field(..., strict=True, ge=0, le=9007199254740991)
```

### SignedFundingRequest

[Source: tsn-protocol/services/tsn-node/core/schemas/signed_funding_request.py, line 7](../../tsn-protocol/services/tsn-node/core/schemas/signed_funding_request.py).

Inherited model sources: `PaymentAuthorizationFields` ([Source: tsn-protocol/services/tsn-node/core/schemas/payment_authorization_fields.py, line 7](../../tsn-protocol/services/tsn-node/core/schemas/payment_authorization_fields.py)).

```python
model_config = ConfigDict(extra='forbid')
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
senderFundingMode: Literal['tcap_funded_note_v1'] = Field(..., description='Required proof-bound private funding authority model')
fundingNote: dict[str, Any] = Field(..., repr=False, description='Private note opening restricted to Node verification')
recipientAmount: Optional[float] = Field(None, description='Amount paid to recipient')
destinationNetwork: Optional[str] = Field(None, description='Signed destination settlement network for cross-chain exits')
destinationExecutor: Optional[str] = Field(None, description='Signed destination executor contract for cross-chain exits')
destinationToken: Optional[str] = Field(None, description='Signed destination-chain ERC-20 settlement token')
settlementRouteId: Optional[str] = Field(None, description='Signed registered TSN settlement route')
source: Optional[str] = Field(None)
senderSignedFundingTransaction: str = Field(..., repr=False)
senderFundingBlockhashContext: SenderFundingBlockhashContext
```

### SignedLeasePermitRequest

[Source: tsn-protocol/services/tsn-node/core/schemas/signed_lease_permit_request.py, line 4](../../tsn-protocol/services/tsn-node/core/schemas/signed_lease_permit_request.py).

```python
operatorPubkey: str
requestedAtTs: int
requestSignatureBase64: str
```

### TokenNetworkStatus

[Source: tsn-protocol/services/tsn-node/core/schemas/token_network_status.py, line 5](../../tsn-protocol/services/tsn-node/core/schemas/token_network_status.py).

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

### UpdateStatusRequest

[Source: tsn-protocol/services/tsn-node/core/schemas/update_status_request.py, line 6](../../tsn-protocol/services/tsn-node/core/schemas/update_status_request.py).

```python
status: str = Field(...)
assignedCrankerPubkey: Optional[str] = Field(None)
fundingTxSig: Optional[str] = Field(None)
settlementTxSig: Optional[str] = Field(None)
settlementResolution: Optional[str] = Field(None)
settlementReason: Optional[str] = Field(None)
```

### UptimeMetrics

[Source: tsn-protocol/services/tsn-node/core/schemas/uptime_metrics.py, line 4](../../tsn-protocol/services/tsn-node/core/schemas/uptime_metrics.py).

```python
service_started_at: str
uptime_seconds: int
uptime_days: float
downtime_events: int = 0
```

## Receiver route handlers

Paths below follow the Next.js filesystem router. Application aliases and proxies are configured separately; a Node endpoint is not automatically a Receiver endpoint.

### POST `/api/cranker/auth/challenge`

[Source: tsn-protocol/services/tsn-receiver/app/api/cranker/auth/challenge/route.ts, line 5](../../tsn-protocol/services/tsn-receiver/app/api/cranker/auth/challenge/route.ts).

Component: `POST`. [Source: tsn-protocol/services/tsn-receiver/lib/http/api/cranker/auth/challenge/POST.ts, line 7](../../tsn-protocol/services/tsn-receiver/lib/http/api/cranker/auth/challenge/POST.ts).

### POST `/api/cranker/auth/session`

[Source: tsn-protocol/services/tsn-receiver/app/api/cranker/auth/session/route.ts, line 5](../../tsn-protocol/services/tsn-receiver/app/api/cranker/auth/session/route.ts).

Component: `POST`. [Source: tsn-protocol/services/tsn-receiver/lib/http/api/cranker/auth/session/POST.ts, line 7](../../tsn-protocol/services/tsn-receiver/lib/http/api/cranker/auth/session/POST.ts).

### POST `/api/cranker/settlement-signature`

[Source: tsn-protocol/services/tsn-receiver/app/api/cranker/settlement-signature/route.ts, line 5](../../tsn-protocol/services/tsn-receiver/app/api/cranker/settlement-signature/route.ts).

Component: `POST`. [Source: tsn-protocol/services/tsn-receiver/lib/http/api/cranker/settlement-signature/POST.ts, line 8](../../tsn-protocol/services/tsn-receiver/lib/http/api/cranker/settlement-signature/POST.ts).

Handler authorization/ingress control references: `authenticateCrankerRequest` ([Source: tsn-protocol/services/tsn-receiver/lib/authentication/cranker/authenticate-cranker-request.ts, line 12](../../tsn-protocol/services/tsn-receiver/lib/authentication/cranker/authenticate-cranker-request.ts)), `enforceCrankerLeaseRateLimit` ([Source: tsn-protocol/services/tsn-receiver/lib/authentication/cranker/enforce-cranker-lease-rate-limit.ts, line 7](../../tsn-protocol/services/tsn-receiver/lib/authentication/cranker/enforce-cranker-lease-rate-limit.ts)).

### POST `/api/cranker/wake-token`

[Source: tsn-protocol/services/tsn-receiver/app/api/cranker/wake-token/route.ts, line 5](../../tsn-protocol/services/tsn-receiver/app/api/cranker/wake-token/route.ts).

Component: `POST`. [Source: tsn-protocol/services/tsn-receiver/lib/http/api/cranker/wake-token/POST.ts, line 9](../../tsn-protocol/services/tsn-receiver/lib/http/api/cranker/wake-token/POST.ts).

Handler authorization/ingress control references: `authenticateCrankerRequest` ([Source: tsn-protocol/services/tsn-receiver/lib/authentication/cranker/authenticate-cranker-request.ts, line 12](../../tsn-protocol/services/tsn-receiver/lib/authentication/cranker/authenticate-cranker-request.ts)).

### POST `/api/cranker/work/retry`

[Source: tsn-protocol/services/tsn-receiver/app/api/cranker/work/retry/route.ts, line 5](../../tsn-protocol/services/tsn-receiver/app/api/cranker/work/retry/route.ts).

Component: `POST`. [Source: tsn-protocol/services/tsn-receiver/lib/http/api/cranker/work/retry/POST.ts, line 9](../../tsn-protocol/services/tsn-receiver/lib/http/api/cranker/work/retry/POST.ts).

Handler authorization/ingress control references: `authenticateCrankerRequest` ([Source: tsn-protocol/services/tsn-receiver/lib/authentication/cranker/authenticate-cranker-request.ts, line 12](../../tsn-protocol/services/tsn-receiver/lib/authentication/cranker/authenticate-cranker-request.ts)).

### PUT `/api/cranker/work`

[Source: tsn-protocol/services/tsn-receiver/app/api/cranker/work/route.ts, line 5](../../tsn-protocol/services/tsn-receiver/app/api/cranker/work/route.ts).

Component: `PUT`. [Source: tsn-protocol/services/tsn-receiver/lib/http/api/cranker/work/PUT.ts, line 12](../../tsn-protocol/services/tsn-receiver/lib/http/api/cranker/work/PUT.ts).

Handler authorization/ingress control references: `authenticateCrankerRequest` ([Source: tsn-protocol/services/tsn-receiver/lib/authentication/cranker/authenticate-cranker-request.ts, line 12](../../tsn-protocol/services/tsn-receiver/lib/authentication/cranker/authenticate-cranker-request.ts)).

### POST `/api/cranker/work`

[Source: tsn-protocol/services/tsn-receiver/app/api/cranker/work/route.ts, line 7](../../tsn-protocol/services/tsn-receiver/app/api/cranker/work/route.ts).

Component: `POST`. [Source: tsn-protocol/services/tsn-receiver/lib/http/api/cranker/work/POST.ts, line 13](../../tsn-protocol/services/tsn-receiver/lib/http/api/cranker/work/POST.ts).

Handler authorization/ingress control references: `authenticateCrankerRequest` ([Source: tsn-protocol/services/tsn-receiver/lib/authentication/cranker/authenticate-cranker-request.ts, line 12](../../tsn-protocol/services/tsn-receiver/lib/authentication/cranker/authenticate-cranker-request.ts)), `enforceCrankerLeaseRateLimit` ([Source: tsn-protocol/services/tsn-receiver/lib/authentication/cranker/enforce-cranker-lease-rate-limit.ts, line 7](../../tsn-protocol/services/tsn-receiver/lib/authentication/cranker/enforce-cranker-lease-rate-limit.ts)).

### PATCH `/api/cranker/work`

[Source: tsn-protocol/services/tsn-receiver/app/api/cranker/work/route.ts, line 9](../../tsn-protocol/services/tsn-receiver/app/api/cranker/work/route.ts).

Component: `PATCH`. [Source: tsn-protocol/services/tsn-receiver/lib/http/api/cranker/work/PATCH.ts, line 12](../../tsn-protocol/services/tsn-receiver/lib/http/api/cranker/work/PATCH.ts).

Handler authorization/ingress control references: `authenticateCrankerRequest` ([Source: tsn-protocol/services/tsn-receiver/lib/authentication/cranker/authenticate-cranker-request.ts, line 12](../../tsn-protocol/services/tsn-receiver/lib/authentication/cranker/authenticate-cranker-request.ts)).

### GET `/api/health`

[Source: tsn-protocol/services/tsn-receiver/app/api/health/route.ts, line 5](../../tsn-protocol/services/tsn-receiver/app/api/health/route.ts).

Component: `GET`. [Source: tsn-protocol/services/tsn-receiver/lib/http/api/health/GET.ts, line 8](../../tsn-protocol/services/tsn-receiver/lib/http/api/health/GET.ts).

### GET `/api/internal/node/coordination`

[Source: tsn-protocol/services/tsn-receiver/app/api/internal/node/coordination/route.ts, line 5](../../tsn-protocol/services/tsn-receiver/app/api/internal/node/coordination/route.ts).

Component: `GET`. [Source: tsn-protocol/services/tsn-receiver/lib/http/api/internal/node/coordination/GET.ts, line 8](../../tsn-protocol/services/tsn-receiver/lib/http/api/internal/node/coordination/GET.ts).

Handler authorization/ingress control references: `requireService` ([Source: tsn-protocol/services/tsn-receiver/lib/authentication/service/require-service.ts, line 6](../../tsn-protocol/services/tsn-receiver/lib/authentication/service/require-service.ts)).

### POST `/api/internal/node/coordination`

[Source: tsn-protocol/services/tsn-receiver/app/api/internal/node/coordination/route.ts, line 7](../../tsn-protocol/services/tsn-receiver/app/api/internal/node/coordination/route.ts).

Component: `POST`. [Source: tsn-protocol/services/tsn-receiver/lib/http/api/internal/node/coordination/POST.ts, line 8](../../tsn-protocol/services/tsn-receiver/lib/http/api/internal/node/coordination/POST.ts).

Handler authorization/ingress control references: `requireService` ([Source: tsn-protocol/services/tsn-receiver/lib/authentication/service/require-service.ts, line 6](../../tsn-protocol/services/tsn-receiver/lib/authentication/service/require-service.ts)).

### POST `/api/internal/node/state`

[Source: tsn-protocol/services/tsn-receiver/app/api/internal/node/state/route.ts, line 5](../../tsn-protocol/services/tsn-receiver/app/api/internal/node/state/route.ts).

Component: `POST`. [Source: tsn-protocol/services/tsn-receiver/lib/http/api/internal/node/state/POST.ts, line 8](../../tsn-protocol/services/tsn-receiver/lib/http/api/internal/node/state/POST.ts).

Handler authorization/ingress control references: `requireService` ([Source: tsn-protocol/services/tsn-receiver/lib/authentication/service/require-service.ts, line 6](../../tsn-protocol/services/tsn-receiver/lib/authentication/service/require-service.ts)).

### POST `/api/internal/node/work/funding`

[Source: tsn-protocol/services/tsn-receiver/app/api/internal/node/work/funding/route.ts, line 4](../../tsn-protocol/services/tsn-receiver/app/api/internal/node/work/funding/route.ts).

Component: `POST`. [Source: tsn-protocol/services/tsn-receiver/lib/http/api/internal/node/work/funding/POST.ts, line 6](../../tsn-protocol/services/tsn-receiver/lib/http/api/internal/node/work/funding/POST.ts).

Handler authorization/ingress control references: `requireService` ([Source: tsn-protocol/services/tsn-receiver/lib/authentication/service/require-service.ts, line 6](../../tsn-protocol/services/tsn-receiver/lib/authentication/service/require-service.ts)).

### POST `/api/internal/node/work/reconcile`

[Source: tsn-protocol/services/tsn-receiver/app/api/internal/node/work/reconcile/route.ts, line 5](../../tsn-protocol/services/tsn-receiver/app/api/internal/node/work/reconcile/route.ts).

Component: `POST`. [Source: tsn-protocol/services/tsn-receiver/lib/http/api/internal/node/work/reconcile/POST.ts, line 8](../../tsn-protocol/services/tsn-receiver/lib/http/api/internal/node/work/reconcile/POST.ts).

Handler authorization/ingress control references: `requireService` ([Source: tsn-protocol/services/tsn-receiver/lib/authentication/service/require-service.ts, line 6](../../tsn-protocol/services/tsn-receiver/lib/authentication/service/require-service.ts)).

### POST `/api/internal/node/work/resolve-failed`

[Source: tsn-protocol/services/tsn-receiver/app/api/internal/node/work/resolve-failed/route.ts, line 5](../../tsn-protocol/services/tsn-receiver/app/api/internal/node/work/resolve-failed/route.ts).

Component: `POST`. [Source: tsn-protocol/services/tsn-receiver/lib/http/api/internal/node/work/resolve-failed/POST.ts, line 8](../../tsn-protocol/services/tsn-receiver/lib/http/api/internal/node/work/resolve-failed/POST.ts).

Handler authorization/ingress control references: `requireService` ([Source: tsn-protocol/services/tsn-receiver/lib/authentication/service/require-service.ts, line 6](../../tsn-protocol/services/tsn-receiver/lib/authentication/service/require-service.ts)).

### POST `/api/internal/node/work/retry`

[Source: tsn-protocol/services/tsn-receiver/app/api/internal/node/work/retry/route.ts, line 5](../../tsn-protocol/services/tsn-receiver/app/api/internal/node/work/retry/route.ts).

Component: `POST`. [Source: tsn-protocol/services/tsn-receiver/lib/http/api/internal/node/work/retry/POST.ts, line 8](../../tsn-protocol/services/tsn-receiver/lib/http/api/internal/node/work/retry/POST.ts).

Handler authorization/ingress control references: `requireService` ([Source: tsn-protocol/services/tsn-receiver/lib/authentication/service/require-service.ts, line 6](../../tsn-protocol/services/tsn-receiver/lib/authentication/service/require-service.ts)).

### POST `/api/internal/node/work`

[Source: tsn-protocol/services/tsn-receiver/app/api/internal/node/work/route.ts, line 5](../../tsn-protocol/services/tsn-receiver/app/api/internal/node/work/route.ts).

Component: `POST`. [Source: tsn-protocol/services/tsn-receiver/lib/http/api/internal/node/work/POST.ts, line 9](../../tsn-protocol/services/tsn-receiver/lib/http/api/internal/node/work/POST.ts).

Handler authorization/ingress control references: `requireService` ([Source: tsn-protocol/services/tsn-receiver/lib/authentication/service/require-service.ts, line 6](../../tsn-protocol/services/tsn-receiver/lib/authentication/service/require-service.ts)).

### GET `/api/internal/node/work`

[Source: tsn-protocol/services/tsn-receiver/app/api/internal/node/work/route.ts, line 7](../../tsn-protocol/services/tsn-receiver/app/api/internal/node/work/route.ts).

Component: `GET`. [Source: tsn-protocol/services/tsn-receiver/lib/http/api/internal/node/work/GET.ts, line 8](../../tsn-protocol/services/tsn-receiver/lib/http/api/internal/node/work/GET.ts).

Handler authorization/ingress control references: `requireService` ([Source: tsn-protocol/services/tsn-receiver/lib/authentication/service/require-service.ts, line 6](../../tsn-protocol/services/tsn-receiver/lib/authentication/service/require-service.ts)).

### PATCH `/api/internal/node/work`

[Source: tsn-protocol/services/tsn-receiver/app/api/internal/node/work/route.ts, line 9](../../tsn-protocol/services/tsn-receiver/app/api/internal/node/work/route.ts).

Component: `PATCH`. [Source: tsn-protocol/services/tsn-receiver/lib/http/api/internal/node/work/PATCH.ts, line 8](../../tsn-protocol/services/tsn-receiver/lib/http/api/internal/node/work/PATCH.ts).

Handler authorization/ingress control references: `requireService` ([Source: tsn-protocol/services/tsn-receiver/lib/authentication/service/require-service.ts, line 6](../../tsn-protocol/services/tsn-receiver/lib/authentication/service/require-service.ts)).

### PUT `/api/internal/node/work`

[Source: tsn-protocol/services/tsn-receiver/app/api/internal/node/work/route.ts, line 11](../../tsn-protocol/services/tsn-receiver/app/api/internal/node/work/route.ts).

Component: `PUT`. [Source: tsn-protocol/services/tsn-receiver/lib/http/api/internal/node/work/PUT.ts, line 8](../../tsn-protocol/services/tsn-receiver/lib/http/api/internal/node/work/PUT.ts).

Handler authorization/ingress control references: `requireService` ([Source: tsn-protocol/services/tsn-receiver/lib/authentication/service/require-service.ts, line 6](../../tsn-protocol/services/tsn-receiver/lib/authentication/service/require-service.ts)).

### POST `/api/work`

[Source: tsn-protocol/services/tsn-receiver/app/api/work/route.ts, line 5](../../tsn-protocol/services/tsn-receiver/app/api/work/route.ts).

Component: `POST`. [Source: tsn-protocol/services/tsn-receiver/lib/http/api/work/POST.ts, line 8](../../tsn-protocol/services/tsn-receiver/lib/http/api/work/POST.ts).

Handler authorization/ingress control references: `assertExternalWorkKind` ([Source: tsn-protocol/services/tsn-receiver/lib/contracts/kinds/assert-external-work-kind.ts, line 10](../../tsn-protocol/services/tsn-receiver/lib/contracts/kinds/assert-external-work-kind.ts)).

### GET `/api/work`

[Source: tsn-protocol/services/tsn-receiver/app/api/work/route.ts, line 7](../../tsn-protocol/services/tsn-receiver/app/api/work/route.ts).

Component: `GET`. [Source: tsn-protocol/services/tsn-receiver/lib/http/api/work/GET.ts, line 8](../../tsn-protocol/services/tsn-receiver/lib/http/api/work/GET.ts).

### GET `/api/work-status/[id]`

[Source: tsn-protocol/services/tsn-receiver/app/api/work-status/[id]/route.ts, line 5](../../tsn-protocol/services/tsn-receiver/app/api/work-status/[id]/route.ts).

Component: `GET`. [Source: tsn-protocol/services/tsn-receiver/lib/http/api/work-status/by-id/GET.ts, line 13](../../tsn-protocol/services/tsn-receiver/lib/http/api/work-status/by-id/GET.ts).

### POST `/intents`

[Source: tsn-protocol/services/tsn-receiver/app/intents/route.ts, line 5](../../tsn-protocol/services/tsn-receiver/app/intents/route.ts).

Component: `POST`. [Source: tsn-protocol/services/tsn-receiver/lib/http/intents/POST.ts, line 9](../../tsn-protocol/services/tsn-receiver/lib/http/intents/POST.ts).

Handler authorization/ingress control references: `assertPaymentAuthorizationIngress` ([Source: tsn-protocol/services/tsn-receiver/lib/contracts/validation/assert-payment-authorization-ingress.ts, line 6](../../tsn-protocol/services/tsn-receiver/lib/contracts/validation/assert-payment-authorization-ingress.ts)), `requireService` ([Source: tsn-protocol/services/tsn-receiver/lib/authentication/service/require-service.ts, line 6](../../tsn-protocol/services/tsn-receiver/lib/authentication/service/require-service.ts)).

### GET `/intents`

[Source: tsn-protocol/services/tsn-receiver/app/intents/route.ts, line 7](../../tsn-protocol/services/tsn-receiver/app/intents/route.ts).

Component: `GET`. [Source: tsn-protocol/services/tsn-receiver/lib/http/intents/GET.ts, line 10](../../tsn-protocol/services/tsn-receiver/lib/http/intents/GET.ts).

Handler authorization/ingress control references: `requireService` ([Source: tsn-protocol/services/tsn-receiver/lib/authentication/service/require-service.ts, line 6](../../tsn-protocol/services/tsn-receiver/lib/authentication/service/require-service.ts)).

### GET `/network/[...path]`

[Source: tsn-protocol/services/tsn-receiver/app/network/[...path]/route.ts, line 5](../../tsn-protocol/services/tsn-receiver/app/network/[...path]/route.ts).

Component: `GET`. [Source: tsn-protocol/services/tsn-receiver/lib/http/network/proxy/GET.ts, line 11](../../tsn-protocol/services/tsn-receiver/lib/http/network/proxy/GET.ts).

### POST `/network/[...path]`

[Source: tsn-protocol/services/tsn-receiver/app/network/[...path]/route.ts, line 6](../../tsn-protocol/services/tsn-receiver/app/network/[...path]/route.ts).

Component: `GET`. [Source: tsn-protocol/services/tsn-receiver/lib/http/network/proxy/GET.ts, line 11](../../tsn-protocol/services/tsn-receiver/lib/http/network/proxy/GET.ts).

### GET `/tin-operations/[...path]`

[Source: tsn-protocol/services/tsn-receiver/app/tin-operations/[...path]/route.ts, line 6](../../tsn-protocol/services/tsn-receiver/app/tin-operations/[...path]/route.ts).

Component: `forward`. [Source: tsn-protocol/services/tsn-receiver/lib/http/tin-operations/proxy/forward.ts, line 11](../../tsn-protocol/services/tsn-receiver/lib/http/tin-operations/proxy/forward.ts).

### POST `/tin-operations/[...path]`

[Source: tsn-protocol/services/tsn-receiver/app/tin-operations/[...path]/route.ts, line 7](../../tsn-protocol/services/tsn-receiver/app/tin-operations/[...path]/route.ts).

Component: `forward`. [Source: tsn-protocol/services/tsn-receiver/lib/http/tin-operations/proxy/forward.ts, line 11](../../tsn-protocol/services/tsn-receiver/lib/http/tin-operations/proxy/forward.ts).

### PATCH `/tin-operations/[...path]`

[Source: tsn-protocol/services/tsn-receiver/app/tin-operations/[...path]/route.ts, line 8](../../tsn-protocol/services/tsn-receiver/app/tin-operations/[...path]/route.ts).

Component: `forward`. [Source: tsn-protocol/services/tsn-receiver/lib/http/tin-operations/proxy/forward.ts, line 11](../../tsn-protocol/services/tsn-receiver/lib/http/tin-operations/proxy/forward.ts).

### DELETE `/tin-operations/[...path]`

[Source: tsn-protocol/services/tsn-receiver/app/tin-operations/[...path]/route.ts, line 9](../../tsn-protocol/services/tsn-receiver/app/tin-operations/[...path]/route.ts).

Component: `forward`. [Source: tsn-protocol/services/tsn-receiver/lib/http/tin-operations/proxy/forward.ts, line 11](../../tsn-protocol/services/tsn-receiver/lib/http/tin-operations/proxy/forward.ts).

### GET `/tin-operations`

[Source: tsn-protocol/services/tsn-receiver/app/tin-operations/route.ts, line 5](../../tsn-protocol/services/tsn-receiver/app/tin-operations/route.ts).

Component: `GET`. [Source: tsn-protocol/services/tsn-receiver/lib/http/tin-operations/GET.ts, line 8](../../tsn-protocol/services/tsn-receiver/lib/http/tin-operations/GET.ts).

### POST `/tin-operations`

[Source: tsn-protocol/services/tsn-receiver/app/tin-operations/route.ts, line 7](../../tsn-protocol/services/tsn-receiver/app/tin-operations/route.ts).

Component: `POST`. [Source: tsn-protocol/services/tsn-receiver/lib/http/tin-operations/POST.ts, line 8](../../tsn-protocol/services/tsn-receiver/lib/http/tin-operations/POST.ts).

### GET `/tin-routes/[...path]`

[Source: tsn-protocol/services/tsn-receiver/app/tin-routes/[...path]/route.ts, line 6](../../tsn-protocol/services/tsn-receiver/app/tin-routes/[...path]/route.ts).

Component: `run`. [Source: tsn-protocol/services/tsn-receiver/lib/http/tin-routes/proxy/run.ts, line 11](../../tsn-protocol/services/tsn-receiver/lib/http/tin-routes/proxy/run.ts).

### POST `/tin-routes/[...path]`

[Source: tsn-protocol/services/tsn-receiver/app/tin-routes/[...path]/route.ts, line 7](../../tsn-protocol/services/tsn-receiver/app/tin-routes/[...path]/route.ts).

Component: `run`. [Source: tsn-protocol/services/tsn-receiver/lib/http/tin-routes/proxy/run.ts, line 11](../../tsn-protocol/services/tsn-receiver/lib/http/tin-routes/proxy/run.ts).

### DELETE `/tin-routes/[...path]`

[Source: tsn-protocol/services/tsn-receiver/app/tin-routes/[...path]/route.ts, line 8](../../tsn-protocol/services/tsn-receiver/app/tin-routes/[...path]/route.ts).

Component: `run`. [Source: tsn-protocol/services/tsn-receiver/lib/http/tin-routes/proxy/run.ts, line 11](../../tsn-protocol/services/tsn-receiver/lib/http/tin-routes/proxy/run.ts).

## Request, error and retry interpretation

Use the typed SDK contracts for intent construction. New native funding requires the canonical signed payment, exact owner-signed `tcap_funded_note_v1` deposit, restricted private opening and required `senderFundingBlockhashContext`. That tuple is client-reported routing/lifetime metadata, not an issuer signature. Confirmed funding uses its separate receipt model and does not infer missing issuance context. Receiver rejects externally created SETTLEMENT work. Worker APIs use their configured keys/session and lease controls; a public work-status response is a sanitized coordination view.

`TsnHttpClient` throws a plain Error on non-2xx responses and has no automatic retry or timeout. Some Node endpoints return FastAPI `detail` errors, while Receiver routes return their own `error` fields and statuses. No generated OpenAPI availability or uniform rate limit is claimed here. Retry only after distinguishing accepted work from a lost response, and reconcile transaction signatures before reconstructing funding.

See [component records](components.md), [invariants](invariants.md), and the [SDK troubleshooting guide](../../tsn-protocol/tsn-docs/sdk/troubleshooting.mdx).
