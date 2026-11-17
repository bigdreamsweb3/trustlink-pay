# Receiver state transport

`ReceiverStore` is the remote durable-state adapter used by the Node. Its methods preserve the authenticated `/api/internal/node/state` operation envelope, ordered deduplicated endpoints, retry behavior for server/request failures, rejection of other client errors and the existing timeout. Hash operations, atomic `consume_once`, multi-key deletion and explicit HTTP-client closure remain available.

`app.receiver_store` remains the public interface. Constructing an adapter configures an HTTP client; actual state operations use the caller's Receiver URL and shared credential. No queue database is introduced in Node. State-operation tests should inject an HTTP transport and assert failure/status behavior without using a live Receiver.
