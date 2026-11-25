# Local Node contract tests

Ten synthetic cases cover encrypted cache restart, unknown execution reservations, path/hash admission, response binding, exact publication retry, loopback peers, lease-loss cancellation, corrupt cache, shared prover arguments and corrupt cursor refresh. Each function has its own file and fixtures use synthetic keys, isolated temporary state and mocked Receiver ports. No operator service, network or chain state is accessed.
