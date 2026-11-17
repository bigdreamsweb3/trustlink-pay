# Optional Attestcoin receipt worker

`AttestcoinWorker` retains the optional policy-gated TinExitAttested workflow, durable tracker dependency, helper subprocess, retry limits and injected EVM Cranker submission boundary. Its state labels and transitions are preserved from the original worker; a recorded label is not independent proof of transaction confirmation. `HttpEvmCranker` uses the configured endpoint and returns its supplied transaction hash. `InMemoryAttestationTracker` remains an isolated-test adapter.

`attestcoin_worker` remains the public interface for these classes, the job/result models, tracker/Cranker protocols and `build_worker_from_environment`. Environment loading preserves the original endpoint/key variables and Windows/non-Windows runner default. The supplied `crosschain_root` remains the subprocess working directory, and the helper-relative path remains unchanged.

Import checks do not run the helper, instantiate a production tracker, contact the Cranker or submit a transaction. Workflow tests should inject tracker, proof and Cranker dependencies. Actual Creditcoin confirmation requires separate observed chain evidence; extraction adds no such guarantee.
