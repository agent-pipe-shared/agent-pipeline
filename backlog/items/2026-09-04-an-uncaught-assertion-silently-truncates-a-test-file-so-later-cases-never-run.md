---
schema: pipeline.backlog-item.v1
id: pipeline.an-uncaught-assertion-silently-truncates-a-test-file-so-later-cases-never-run
type: defect
owner: pipeline
status: open
created: 2026-09-04
sprint: nova-b
done_when: manual
tracking: "Nova B — a failing suite reports one failure and hides an unknown number of cases that never executed. The gate cannot distinguish 'one case failed' from 'one case failed and eight never ran'."
source: "Found while diagnosing the only genuine red in the full verify run at commit 2aeeaa68 (NVA-B-LWSRED-1, 2026-09-04): plugins/pipeline-core/lib/local-worker-supervisor.test.mjs reported one failing test, and LWS08 through LWS15 had not run at all for a day. Confirmed by the fix: the same file now reports 15/15."
---

# An uncaught assertion silently truncates a test file, so every later case never runs

## What happens

Several suites in this repository are written as a single top-level `test(...)`
containing a sequence of `check(...)` calls, rather than one `test(...)` per
case. When an `assert` inside that sequence throws and nothing catches it, Node
terminates the module. Every case after the throwing line never executes.

The run reports:

    ℹ tests 1
    ℹ pass 0
    ℹ fail 1

That is accurate and useless. It says one test failed. It does not say — and
cannot say — that eight further cases were never reached, because from the
runner's point of view they never existed.

## The measured instance

`plugins/pipeline-core/lib/local-worker-supervisor.test.mjs` aborted at LWS07's
`assert.equal(validateLocalWorkerSupervisorRecord(record).ok, true)`. LWS08
through LWS15 did not run. After the fix, the same file reports `15/15 checks
passed` — so eight cases had been dark, including LWS12's JSON Schema closure
and LWS15's pinning of `observeRunner`'s probe argument vectors.

The window was about a day: commit `91f9bc45` (2026-09-03) changed
`unsignedDigest()` to exclude the heartbeat from `recordSha256` and did not
update the suite's own `finalize()` fixture helper, which still hashed the full
clone. The fixture then built a record the validator correctly rejected.

Two distinct failures compound here and should not be conflated:

1. A change to a digest function landed while its own suite was red. That is a
   process failure, and QG-01 already names it.
2. The suite's report gave no signal that the failure had also disabled eight
   later cases. That is this item.

The second is the dangerous one, because it is silent and it scales: this
repository runs 506 registered suites, and a single reported failure anywhere in
that set may be masking an arbitrary number of unrun cases in the same file.

## Why the existing signal is not enough

`verify.mjs` records a per-suite exit code. A suite that aborts after case 7 of
15 and a suite that fails case 15 of 15 both report exit 1. The difference —
eight assertions that produced no evidence either way — is invisible in the
gate's own output, in the verify journal, and in the per-suite receipt.

Nothing here is Node's fault. `node --test` reports what it observed, and it
observed one test. The gap is that this repository's suite style makes "one
test" mean "up to N cases", and no artifact records N.

## Direction to evaluate

Two independent directions, either alone is worth something:

1. **Make the count observable.** A suite that runs a fixed number of checks
   can state it: the passing runs already print `15/15 checks passed`, so the
   denominator exists at authoring time. If the suite declared its expected
   count up front and the harness compared it against the reported count, a
   truncated run would be distinguishable from a failing one without touching
   any test's logic.
2. **Stop the abort from being silent at the harness level.** `verify.mjs` sees
   the suite's stdout. A run whose last line is not the suite's own completion
   line has terminated early, whatever its exit code says. Detecting that is
   cheap and needs no change to the suites themselves.

Direction 2 covers every existing suite without editing any of them, which is
the stronger property. Direction 1 is more precise but only for suites that
adopt it.

Neither should be built before answering: how many suites in this repository use
the single-`test`-with-many-checks style at all? If it is a handful, converting
them to one `test(...)` per case is a third direction and possibly the simplest.

## Affected artifacts

- `plugins/pipeline-core/lib/local-worker-supervisor.test.mjs` — the measured
  instance, now green at 15/15
- `harness/scripts/verify.mjs` — where a harness-level detector would live
  (TP-3 protected; a change there needs a PO signature ceremony)
- `plugins/pipeline-core/scripts/verify-journal.mjs` — the per-suite receipt
  that today records only an exit code
- `guardrails/quality-gates.md` — QG-01, which the process half of the 2026-09-03
  instance engages
