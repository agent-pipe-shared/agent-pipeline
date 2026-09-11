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

## Implementation progress — 2026-09-11

The measured `local-worker-supervisor.test.mjs` instance now registers LWS01
through LWS15 as separate `node:test` cases. Its regression probe deliberately
fails LWS07 in a child and records callback execution over a separate inherited
file descriptor; it requires the exact ordered sequence LWS01 through LWS15.
This avoids relying on the test reporter stream and proves later cases really
ran rather than merely being registered.

The normal registered invocation is green. An independent correction Critic
also recreated the injected failure: exit status 1, with all 15 callback IDs
present in order, and returned PASS with no findings. See
`backlog/evidence/2026-09-11-local-worker-supervisor-complete-corpus.md`.

The item remains open while the registered legacy population is migrated into
the completion protocol and Verify consumes the resulting evidence.

### Repository inventory

The requested inventory is no longer an unknown. Of 520 registered Verify
steps, 490 are test registrations covering 488 files. The first static scan
reported 166 vulnerable registrations in 165 files, but it parsed only the
main Verify array and missed mixed `node:test`/throwing-wrapper shapes. The
closed checker now parses every Verify registration array and reports 170
vulnerable registrations in 169 files: 85 direct throwing `check(name, fn)` or
`run(name, fn)` suites, 77 top-level assertion suites without `node:test`, and
eight single-`node:test` suites containing multiple assertion sites.
Catch-and-continue wrappers are excluded.

The counts are triage data rather than semantic test-case counts: the corrected
classifier found 1,288 direct wrapper calls, 5,058 syntactic assertion sites in
the top-level group and 141 in the single-test group. This establishes that a
repository-wide one-file conversion is not a small fix. The next bounded
integration is to bind the already-converted local worker pool and supervisor
to the normal descriptor path; broader harness-level completion evidence
remains the scalable direction.
See `backlog/evidence/2026-09-11-truncating-suite-inventory.md`.

That bounded conversion is now complete in `5366d7f4`. All six original
assertion bodies are separately registered; an injected LWP03 failure records
callback execution through LWP06 over the independent FD-3 channel. The normal
suite passes 6/6 and an independent Critic returned PASS with no findings.

### Scalable direction

The inventory rules out the proposed last-stdout-line heuristic as a complete
remedy: heterogeneous suites do not share a trustworthy completion line, and
process completion does not prove declared cases were disposed. The bounded
design is now a versioned opt-in case-completion protocol over a separate file
descriptor, plus a complete registry that marks every affected suite either
`required` or explicitly `legacy-process-only` during migration.

`node:test` wrappers emit a declared ordered case set, one terminal disposition
per callback and a final matching digest. Verify binds the policy and
attestation into its receipt; missing, duplicate or partial completion is red
even when the process exits. ADR-0081 selection applies this only to selected
suites without claiming omitted work. User repositories can opt commands into
the same protocol; opaque commands remain honestly process-only. See
`backlog/evidence/2026-09-11-verify-case-completion-design.md`.

The helper landed in `0a163a26`. The versioned schema, complete registry and
fail-closed checker landed in `ee35f669` after an independent correction review
returned PASS. The registry contains 172 entries because it also retains two
syntactically migrated supervisor/pool registrations whose current self-probe
mode is not the normal standardized descriptor path. All entries therefore
remain honestly `legacy-process-only`; no suite earns `required` until its
normal Verify invocation imports the shipped helper and emits the bound stream.

The first normal-path migration landed in `b0512d7d`. Verify now supplies the
descriptor to `local-worker-pool-tests` and
`local-worker-supervisor-core-tests`, captures their declared, disposed and
terminal records over a separate bounded descriptor, and writes a v2 receipt
that binds the exact case policy and completion attestation. A missing,
malformed, oversized, late or policy-drifting stream fails closed; a legacy v1
receipt cannot satisfy either required suite. Direct developer runs remain
usable without minting a receipt. Focused tests and an independent Critic
passed.

The registry is now explicit: **8 required and 169 legacy-process-only**. Five
new installer/dispatch suites entered as required in `f1ce7417`, and
`pipeline-start-v3-tests` migrated in `0ecf0f1f` rather than becoming a newly
touched legacy exception. The exact candidate-bound check from `9b98aa3e`
through `0ecf0f1f` passes. The item stays open for the remaining staged
migration; these commits do not claim that all registered suites have
case-level completion evidence.
