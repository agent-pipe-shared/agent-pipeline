---
schema: pipeline.backlog-item.v1
id: pipeline.ruleset-source-test-unregistered-in-the-verify-gate
type: defect
owner: pipeline
status: open
created: 2026-08-07
source: Measured by the PHX-R1-REWORK-1 dispatch while correcting R1's protection boundary, and re-verified independently by the Elephant. Third occurrence of the same defect class in this feature area.
---

# `ruleset-source.test.mjs` exists but is not registered in the verify gate

## Description

`plugins/pipeline-core/lib/ruleset-source.test.mjs` is a tracked test file with
no entry in `harness/scripts/verify.mjs`. Verified independently: `rg -c
"ruleset-source.test.mjs" harness/scripts/verify.mjs` returns no match.

Suite registration in this repository is a hand-maintained static array —
`TEST_SUITES` plus the equally static `SCOPED_VERIFY_SUITES` and
`WINDOWS_ASSURANCE_VERIFY_SUITES`. There is no globbing and no auto-discovery,
which `harness/scripts/verify.mjs:314-316` states in its own words:

> Registered in the same commit that created them. An unregistered suite is not
> a test Verify forgot to run — it is a test that protects nothing, and the gap
> is invisible precisely because the file exists and passes when run by hand.

That is exactly the present state for this file.

## MEASURED 2026-08-08, after the 0.5.3 merge: it is not three files, it is 108

The Elephant enumerated every `*.test.mjs` under `plugins/pipeline-core/` and
`harness/` and checked each basename against `harness/scripts/verify.mjs`.
**349 test files exist; 108 are registered nowhere.** Roughly 31% of the suite
corpus.

The unregistered set is not a random tail. It clusters in whole subsystems that
appear to have been built and never wired in:

- the entire `governance-*` family (event store, projection, replay, export,
  outbox, delivery, authority resolver — 14 files in `lib/` plus 5 in `scripts/`)
- the `afk-*` family (6 files)
- the `publication-*` / `provenance-*` family (7 files)
- the `codex-*critic*` isolation family (8 files)
- every one of the four `harness/scripts/security-adapters/*.test.mjs`
  (gitleaks, license-check, osv-scanner, semgrep) and
  `security-scan-v2-integration.test.mjs`
- `guard-human-override.test.mjs` and `po-human-approval.test.mjs` — the two
  suites covering the human-authorization surface this session has been reasoning
  about all day, both arriving with the 0.5.3 merge, both unregistered

**This changes the item's shape.** As filed it reads as an oversight about one
file with two siblings. The measurement says the registration array has not kept
pace with the repository at all, and that the security-adapter suites — the ones a
reader would most expect the gate to run — are among the missing.

**Deliberately not acted on.** Registering 108 suites in one change would be
reckless: an unknown number are red, some are slow, and a mass registration would
turn the gate red on arrival with no way to tell a genuine regression from an
inherited one. The right first step is to *run* them, sorted into passes and
failures, and register the green ones in batches with the red ones filed. That is
its own measured task, not a line in this item.

**One caveat on the measurement, stated so nobody over-reads it:** the check is a
basename match against the file's text. A suite registered under a path form the
match misses would show as a false positive, and a suite deliberately excluded
(fixtures, generators, platform-specific assurance sets) would show as unregistered
without being a defect. The three subsystem clusters above were spot-checked and
are genuinely absent; the total of 108 is an upper bound until each is classified.

### Classified 2026-08-08 — the figure was 109, and the caveat above was wrong in direction

A dispatch enumerated the set properly (parsing the registration arrays rather than
matching basenames), classified every file, and ran each one. Report:
`specs/sprint-phoenix-epic/evidence/unregistered-suite-classification.md`.

- **109 unregistered, not 108.** The extra file is
  `harness/scripts/security-readiness/security-readiness.test.mjs`, hidden from the
  Elephant's count by a basename collision with the *registered*
  `plugins/pipeline-core/lib/security-readiness.test.mjs`.
- **The "upper bound" caveat was wrong in direction.** It assumed some of the set
  would turn out to be fixtures or helpers and the true number would be lower. It is
  **zero**: every one of the 109 is a real, self-checking, runnable suite.
- **102 green, 7 red, 0 timeouts.** Red share 6.4 %, far below the one-third
  threshold that would have made this a PO decision rather than a batching exercise.
  Total runtime for the green set: **16.8 seconds.**

**A correction to the classification criterion, made by the dispatch and worth
keeping.** A first pass using "imports `node:test`" put 46 files in the
not-really-a-suite bucket — including `ruleset-source.test.mjs`, which *this item*
calls a real suite. Inspection found a second suite style in this repository:
hand-rolled self-checking scripts (`function check(name, fn) { … }`, throw on
failure, non-zero exit). The criterion was restated behaviourally — self-checking
and `node`-runnable — and applied uniformly. Anyone measuring test coverage in this
repository by framework import will undercount by roughly 40 %.

**Two findings inside the red set that need an owner rather than a registration
line:**

1. **Three of the seven fail with `SyntaxError: … does not provide an export named
   …`** — they are written against a module surface that does not exist in this
   tree. Registering them would turn the gate red on arrival; they are stale, not
   broken.
2. **`windows-assurance-verify-registration.test.mjs` is unregistered *and* red**,
   failing exactly one check: `WAVR19 Verify fails before ordinary suites with a
   named Windows-assurance registration step`. A suite that pins a property of the
   verify entry point is itself outside the gate and currently failing.

**Recommendation, now that it rests on data:** register the 102 green suites in
batches — the runtime cost is negligible and each batch can be reverted alone — and
file the 7 red ones for triage. Do **not** bundle this with
`backlog/items/2026-08-08-first-verify-run-is-red-with-four-failures.md`: that item
is about what the gate says now, this one about what should be in it, and answering
them together invites registering suites to dilute a red.

**Not observed, and checked for:** no suite in the set mutated a tracked file. One
mid-run appearance of a staged `harness/scripts/verify.mjs` was traced to a parallel
dispatch's commit, not to a suite. The set was re-enumerated at the final HEAD and is
byte-identical to the set that was run.

## Why this one matters beyond the general rule

`normalizeRulesetSource` from that module decides one of the two disjuncts of
the bootstrap readiness gate's attestation
(`plugins/pipeline-core/scripts/pipeline-start-preflight.mjs:282-292`:
`attestationFailed = !originAllowlisted || normalized?.status !== "ready"`). So
the unrun suite is not incidental coverage — it pins an input to a
security-relevant gate decision.

This is the **third** occurrence of the same defect class in this feature area,
which is why it is recorded as a pattern rather than only as an instance:

1. `public-core-origin-allowlist.test.mjs` was created unregistered — found as
   Critic finding F3 on the WP2-WP3 Part A implementation review.
2. Six further suites across three work packages were found unregistered while
   assembling that fix (closed by commit `550b21f`).
3. This one, still open.

The common cause is structural, not carelessness: `harness/scripts/verify.mjs`
is TP-3-protected, so the registration line cannot be added in the same dispatch
that writes the test. Every author therefore has to hand the edit off, and a
hand-off is exactly what gets dropped.

## Triggering situation

Found 2026-08-07 by the dispatch reworking residual R1's protection boundary,
while establishing which modules the extracted attestation gate depends on.
Re-verified by the Elephant against `harness/scripts/verify.mjs` before
recording.

## Affected artifact

`harness/scripts/verify.mjs` (the missing registration; TP-3-protected) and
`plugins/pipeline-core/lib/ruleset-source.test.mjs` (the unrun suite). Context
for why it matters: `plugins/pipeline-core/scripts/pipeline-start-preflight.mjs:282-292`.

## Proposal

**Owner: PO.** Two parts, and the second is the one that stops the recurrence.

1. **The instance.** Add the registration line for
   `plugins/pipeline-core/lib/ruleset-source.test.mjs`, following the shape of
   its siblings. Because `harness/scripts/verify.mjs` is TP-3-protected this
   needs its own briefed test-change task or a PO edit outside an agent session
   — it cannot ride along in an unrelated dispatch. Note the newly available
   signed-override route may make this cheaper than it was; that is worth
   checking before scheduling the hand-off.
2. **The class.** Three occurrences with one structural cause is a design
   signal. Options, disclosed rather than pre-selected: (a) a check that fails
   when a `*.test.mjs` file under the registered roots has no registration entry
   — mechanical, closes the class, and is itself a verify step so it needs the
   same protected edit exactly once; (b) make registration part of the
   protected-path hand-off checklist so it is never implicit; (c) accept the
   recurrence and rely on review, which has caught it three times but only
   after the fact. Option (a) is the only one that makes the gap visible without
   a reviewer.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:**
- **Rationale:**
- **Assignment (if accepted):**
- **Date:**
