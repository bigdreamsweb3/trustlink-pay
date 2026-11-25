# Protected local reply and metadata cache

`CacheDependencies` supplies the cache directory, primary Receiver URL, verification signer and local lock. `cache_key` derives an AES-GCM key with HKDF-SHA256 under `TSN_LOCAL_NODE_REPLY_CACHE_V1`; it adds no keypair or plaintext key file. `cache_path` admits fixed hex job IDs. `atomic_cache_json` publishes a flushed temporary file by replacement.

`reserve_local_reply` records execution identity before dispatch, capped at 128 outstanding files. `save_local_reply` encrypts exact reply bytes with job/request-hash AAD. `load_cached_reply` validates identity and authentication; a reservation without a result or corrupt bytes fails closed. `discard_published_reply` removes only the acknowledged job file. Preserve uncertain reservations until the original operation is reconciled. Receiver owns authoritative work and leases.

`remember_local_work` and `cache_receiver_work` store at most 128 coordination summaries without private payloads or openings. Metadata IO errors do not block authoritative Receiver processing. Cursor state is a recoverable hint; reply reservations and protected witness/opening backups have separate recovery obligations. The directory is ignored by Git. Changing the primary Receiver or verification seed changes cache-key derivation and requires deliberate reconciliation.

Synthetic tests in `tests/test_local_node.py` verify encrypted restart, corruption and unknown execution. Filesystem permissions, live recovery and hardware durability remain deployment-specific checks.
