# `project-onboarding-v3-tests` internal sharding — 2026-09-11

## Result

The direct suite entry point now runs four real Node child processes. Each child
receives `--pipeline-internal-shard=<index>/4`; test declarations are assigned
by declaration index modulo four. The parent waits for every child and fails if
any child reports an error, signal, or non-zero exit. Importing the module still
declares no tests, and an invalid shard such as `4/4` is rejected before tests
run.

| Measurement | Candidate | Cases | Duration |
|---|---|---:|---:|
| Before | `949eb2e8` | 166 passed, 0 failed | 55.771s |
| After | `72617333` | 166 passed, 0 failed | 16.930s |

The focused reduction is 38.841s, or 69.6%, on the same machine and command.
The machine-readable records retain the exact commit/tree binding, clean status
before and after, command, timestamps, exit status, output hashes, and relevant
summary lines:

- `backlog/evidence/2026-09-11-project-onboarding-v3-before.json`
- `backlog/evidence/2026-09-11-project-onboarding-v3-after.json`

The earlier static profile counted 54 child-process call sites and a temporary
root per case. A diagnostic run with `NODE_DEBUG=child_process` emitted 1,677
child-process debug records across the full suite. Those are debug records, not
a proven count of unique process launches. Together with the unchanged case
count and the measured result, they support process-start latency as the target
of the four-way sharding without requiring weaker assertions or removed tests.

## Integration evidence

The exact-bound Verify evidence
`evidence/verify-1789105958768-9d4adf5526e6afbc.json` binds clean candidate
`72617333eb5fe0fa0740fe0e174c87759b3eca31` and tree
`3a0c5d4b251307a19ee43873b6d79c876fce631d`. It passed 520/520 fresh steps.
Inside that run `project-onboarding-v3-tests` took 20.669s, and the full run
lasted from `2026-09-11T05:52:38.768Z` to `2026-09-11T05:55:49.142Z`, or
190.374s.

The focused importer check
`node plugins/pipeline-core/hooks/guard-lifecycle-recovery-contract.test.mjs`
also passed 2/2, confirming that importing the test helper does not trigger the
direct-entry orchestrator.

## Boundary of the claim

The 69.6% figure belongs only to the focused suite comparison. The full Verify
remains bounded by its serial lane, so this change primarily removes suite
compute and ordinary-pool pressure. It does not establish a 69.6% full-gate
wall-clock improvement.
