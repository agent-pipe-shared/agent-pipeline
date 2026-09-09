# Critic message phases and selected failure diagnostics

Task: `NVA-B-CRITIC-PHASE-DIAGNOSTICS-1`.

The historical child at `1f2cb9b5` treated documented `commentary` followed
by one `final_answer` as a duplicate answer. The isolated, ignored scratch
reproduction ran that historical child against a model-free fake app server
and observed `childExitCode: 2`, `childCode: "protocol-error"`, and
`commentaryThenFinal: true`. Its capture is
`scratch/NVA-B-CRITIC-PHASE-DIAGNOSTICS-1/historical-commentary-red.capture.txt`.
This historical proof is intentionally outside the committed regression, so a
distributed checkout need not retain that commit.

The committed regression drives the current child through a real subprocess
and fake app server. It accepts commentary before one final answer, retains
the single missing/null legacy answer compatibility case, and rejects duplicate
final or legacy replies, invalid phases, mismatched IDs, file changes,
non-read command actions, and server RPC requests. The three write classes
remain rejected and are projected only as the closed enums `file-change`,
`command-action`, and `server-rpc-request`.

The app-server and selected-host path now retain a closed, selection- and
candidate-bound failure projection at the local selected bridge seam. It
contains allowlisted failure predicates, booleans, approved terminal signals,
and byte counts only. It excludes model output, answer/error text, command
strings, RPC parameters, and stderr/stdout content. The selected-host
regression obtains this projection from an actual app-server failure path;
it does not inject a caller-provided diagnostic.

Validation on 2026-09-09:

- `node --test plugins/pipeline-core/scripts/codex-critic-host.test.mjs`:
  118 checks passed. Capture:
  `scratch/NVA-B-CRITIC-PHASE-DIAGNOSTICS-1/host-regression-green.capture.txt`.
- `node --test harness/scripts/check-consumer-safe-paths.test.mjs`:
  9 checks passed. Capture:
  `scratch/NVA-B-CRITIC-PHASE-DIAGNOSTICS-1/consumer-safe-green.capture.txt`.

No live Critic/provider run was made. The prior live record retained only a
synthesized `childStarted: true`, lost stdio, and null exit; its actual
terminal cause remains unknown.
