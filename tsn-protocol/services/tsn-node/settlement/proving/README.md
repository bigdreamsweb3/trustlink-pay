# Local credit and aggregate proving adapters

This package preserves two separate proving contracts. `prove_hidden_head_credit` invokes the existing pinned local credit prover and binds its thirteen public inputs, circuit hash, key hash and verifier bytes through `validate_prover_result`. `prove_epoch` invokes the existing five-input aggregate prover and checks the corresponding TCAP epoch verifier. Each retains its separate process-local async lock, environment requirements, existing-proof validation mode, timeout, output bounds and error behavior.

The circuit source and Node proving scripts remain anchored to the protocol checkout through explicit contract constants, so extraction does not change artifact discovery. Witnesses and openings enter the subprocess through stdin; stderr remains suppressed by the existing adapters. Native credit and aggregate accounting remain distinct capabilities.

Import the functions from `settlement.proving.prove_hidden_head_credit`, `settlement.proving.validate_prover_result` and `settlement.proving.prove_epoch`. `hidden_head_prover.py` and `tcap_epoch_prover.py` expose these implementations under their existing module paths. Dependencies are witness field encoding, public-key derivation and the caller-supplied epoch RPC. Module import does not invoke a prover, submit a transaction or establish deployment or proving evidence.
