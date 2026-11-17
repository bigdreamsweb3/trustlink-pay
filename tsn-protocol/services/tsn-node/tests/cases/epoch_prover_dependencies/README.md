# Aggregate-prover dependency tests

The discovery shell is `tests/test_epoch_prover_dependencies.py`. Each test function verifies one accounting component through explicit synthetic dependencies: verification passes the reconstructed witness to the prover and defers incomplete groups; authorization revalidates the stored proof and total, then checks the current lease and work version before returning authorization.

These tests perform no real proving, network requests or signing. Run them from the Node directory with `python -m unittest discover -s tests -p test_epoch_prover_dependencies.py`, or include them through `python -m testing.run_suite`.
