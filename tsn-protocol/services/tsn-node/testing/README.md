# Node verification tools

Run `python -m testing.run_suite` from the Node directory with its installed Python dependencies. The runner discovers the existing unittest cases and includes the two existing snapshot/handoff checks. It blocks real HTTP and permits only the existing unsigned TypeScript serialization fixture in the neighboring Cranker directory. `--report-dir PATH` retains a log and JSON summary; `--native-library PATH` selects an already-built compatible native adapter for this process.

The runner clears opt-in proof-test variables in its process. Run the underlying unittest suite separately with isolated matching circuit/proving artifacts to exercise those four checks. The runner starts no services and submits no transactions. All stateful test fixtures use temporary or synthetic data; configuration and private witness files are excluded from source-hash evidence.

Each helper has one responsibility: HTTP guards, subprocess admission, source preservation, or temporary snapshot setup. Replace a guard by editing its dedicated module and rerun the suite. The serializer guard admits exact argv and working-directory values; it must continue to reject signing/deployment commands.
