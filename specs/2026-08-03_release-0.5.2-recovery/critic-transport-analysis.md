# Codex Critic transport hardening

## Observed failure

The release candidate `78be1ed738d4482b21159b69f1c4c150b8a018c9` passed
Verify and Security, but cannot obtain the required final Critic evidence.

The documented Codex Critic path requires a committed sandbox selection and a
selected host bridge. `codex-critic-host.mjs` emits an `execution.launch`
record and waits for an `execution.result` record on stdin. No production
adapter connects that protocol to the local Codex App Server.

Calling `codex exec` directly is not a substitute for that path. In observed
runs it starts a generic session, loses the closed Critic role during bootstrap,
attempts Elephant onboarding, and exits without a Critic receipt. One run also
reported a model-manager refresh timeout while the daemon-version health check
reported ready. `codex doctor` completed, but did not make the direct fallback
produce a receipt.

## Root cause

The release gate has an executable receipt requirement, but the only exposed
Codex CLI transport is a half-duplex host protocol without a production host
adapter. The readiness check proves daemon process/version health, not that a
Critic child can start, retain the Critic role, complete a turn, and return a
candidate-bound receipt.

## Required hardening

1. Provide one production Codex App Server bridge for duty `critic`. It must
   preserve the selected sandbox binding, use the fixed review model, impose
   read-only/no-delegation behavior, and return the existing execution receipt
   contract.
2. Add a model-turn readiness probe to the Critic admission path. A daemon
   version observation alone is insufficient.
3. Make missing bridge, model readiness, role loss, timeout, malformed result,
   and absent receipt terminal typed outcomes before a review child is treated
   as dispatched. They must not be interpreted as a passing verdict.
4. Prohibit the generic `codex exec` fallback for a governed Critic dispatch;
   it has no selected sandbox binding or receipt channel.
5. Add integration tests covering a ready daemon with an unavailable model
   turn, a role-loss response, and a successful candidate-bound Critic receipt.

## Release effect

This is a release-blocking reliability defect. The publication executor must
continue to require Critic evidence; the repair is to make the Critic transport
admissible and observable, not to weaken or bypass that gate.
