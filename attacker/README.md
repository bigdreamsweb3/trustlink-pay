# TrustLink ecosystem attacker harness

This directory is a defensive local-development test harness for the complete
TrustLink ecosystem: TIP/TIN, TSN, mempool/RPC services, and TCAP. It is not a
production scanner or an autonomous exploitation service. It never receives
private keys, seed phrases, production RPC URLs, or real token balances.

## Model

The monitor may observe local transaction pools, local validator logs, local
program accounts, and explicitly configured development API routes. An AI
provider may propose a structured test case from redacted telemetry. The
harness validates that case against an allowlist, runs it in a disposable
local-validator workspace, enforces a timeout/resource limit, and records only
the result and minimized reproduction. AI output is never executed as shell
code, Rust, Python, or JavaScript without an explicit generated-test review step.

Allowed targets are local TIP/TIN, TSN, and TCAP program IDs plus disposable test
accounts. Network access is disabled by default. Development API URLs are loaded
from a local, ignored manifest; provider credentials are read only from
environment variables, never persisted or logged, and are never forwarded to
the target services. Cloud AI receives redacted schemas, status codes, and
transaction fixtures—not wallet secrets, API keys, raw private data, or seed
phrases.

## Initial attack families

- wrong program/account owner;
- wrong PDA seed or bump;
- forged governance, emergency, cranker, or reserve authority;
- duplicate initialization and replayed nullifier;
- wrong asset/mint/token-program/decimal binding;
- paused and uninitialized state transitions;
- arithmetic overflow and liability under-collateralization;
- stale, mismatched, or reordered commitment roots;
- malformed serialization and oversized instruction inputs;
- unauthorized token-account or vault substitution.

Cross-ecosystem cases also cover forged mempool credentials, replayed API
requests, invalid TIN routes, malformed TSN epoch messages, RPC/account
substitution, and inconsistent TIP/TSN/TCAP state transitions.

The harness must fail closed: a missing local validator, unknown target, missing
fixture, or ambiguous test case is a rejected run, never an attempt against a
remote network.
