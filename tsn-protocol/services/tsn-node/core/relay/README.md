# Local outbound relay

`sync_local_node` observes an authenticated Receiver revision cursor, refreshes corrupt local hints and wakes work plus FUNDING/SIGNING/PUBLIC relay lanes. `relay_worker` drains one lane with bounded retries. `process_relay_job` validates a job, confirms its generation and supervises execution/publication with `keep_relay_lease`; losing ownership or the deadline cancels its children. All stateful components accept `RelayDependencies` from runtime composition.

`validate_relay_job` admits existing bounded method/path/body envelopes and verifies the canonical request hash. `dispatch_relay_job` uses existing ASGI handlers in-process. It injects only the local service credential; existing owner, work, transaction and Mother checks still enforce authorization. No command or arbitrary URL dispatch exists.

`execute_relay_job` reserves local execution identity before dispatch and caches exact encrypted replies before publication. An interrupted reservation becomes `NODE_RELAY_OUTCOME_UNKNOWN`; it never silently reruns. `publish_relay_reply` retries the same attested reply and removes an acknowledged normal cache entry only after Receiver completion. Corrupt or uncertain reservations remain for reconciliation. `reply_signature` binds job ID, request hash, claim generation, owner, status and reply bytes using the existing verification signer.

The full offline suite and `tests/test_local_node.py` cover restart encryption, uncertainty, mutation rejection, exact report retry, lease-loss cancellation, local-only peers and cursor recovery. Hosted D1/Worker/Vercel behavior, real signing, transaction submission and hardware resource measurements remain unverified.
