# Complete private credit epoch reconstruction

This package reads the existing TCAP reserve/current epoch, reconstructs accepted credit transactions in order and opens the restricted credit journal to build the complete aggregate witness. It preserves the 201-byte reserve and 136-byte epoch layouts, PDA derivation, digest domains, credit instruction/account layout and native transaction checks. Missing, duplicate, inconsistent or opening-mismatched transcripts retain their existing failures.

`build_epoch_witness` requires the complete 2–64-credit group and produces the same padded amount, blinding and nullifier arrays. `PrivateCreditWait` remains the public bounded-delay exception; its constructor implementation lives in a dedicated module and initializes the same `Exception` base. This package prepares evidence and does not itself reclassify liabilities or schedule service work.

Import `read_epoch`, `build_epoch_witness`, `epoch_credits` and `PrivateCreditWait` from their named implementation modules. `private_credit_coordination.py` preserves their original import surface. Async RPC and native message parsing are explicit caller dependencies; amount openings and Poseidon come from the corresponding packages. No server, shared globals loader or service lifecycle is imported.
