# Supporting durable-state adapters

`get_store` preserves Receiver selection first, then the explicitly enabled direct Firebase or local JSON isolated-test adapters. `get_mempool_store` is its retained public name. `FileStore` preserves its async lock and one-winner `consume_once` behavior. `FirebaseStore` preserves Firestore transactional nonce insertion, batch mapping writes, thread-offloaded operations and its existing credential-selection order. Imported class methods contain the sole implementations; nested transaction callbacks have become explicit bound helper methods.

The remaining functions preserve namespace keys, JSON projection and existing supporting epoch/staleness calculations. These helpers read `app.config`, whose older epoch-related settings are incomplete; they must not be substituted for active server state/configuration. `app.store` remains the public interface, and its `_store` is owned by `app.config` as before extraction.

`tests/test_atomic_nonce_store.py` and `tests/test_threshold_access.py` cover local JSON atomicity and nonce behavior. Firebase tests must inject local Firestore doubles rather than initialize an external project. No store is initialized at import time, and isolated-test adapters are not production fallbacks.
