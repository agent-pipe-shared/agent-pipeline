---
schema: "pipeline.backlog-item.v1"
id: "pipeline.evidence-bound-review-retry-economics"
type: "workflow-improvement"
owner: "pipeline"
status: "in_progress"
created: "2026-07-20"
source: "Public V3 Foundation stabilization review of formal review and dispatch retries"
due: "2026-09-08"
expires: "2026-09-15"
---

# Bound review retries to valid evidence

## Description

A formal review or dispatch abort can force a broad repeat even when the
candidate and already validated domains are unchanged and the abort produced no
new domain finding. Repeating every stage increases latency and model cost while
also obscuring which evidence was actually invalidated.

## Triggering situation

The Public V3 Foundation stabilization on 2026-07-20 retained this workflow debt
from `docs/known-issues.md` for explicit product design rather than embedding an
ad hoc retry shortcut in verification.

## Affected artifact

The public review-economy policy, dispatch/review receipts, retry planning, and
the evidence invalidation rules used by Verify and Critic admission.

## Proposal

Define a deterministic retry planner that preserves prior evidence only when it
is still valid for the exact candidate and domain. A retained receipt must bind
the same commit, tree, scoped diff/domain, policy version, route and assurance,
and must remain within its declared freshness window. The abort evidence must
classify the failure as transport, execution, or orchestration rather than a
domain finding.

The acceptance boundary is:

- candidate, scope, policy, route, assurance, or freshness drift invalidates the
  dependent receipts and triggers the required broader rerun;
- a domain finding always reopens its affected domain and dependencies;
- an evidenced infrastructure-only abort may retry only the failed stage while
  retaining exact still-valid receipts;
- bounded attempt counts and per-stage reuse/rerun decisions are recorded in
  machine evidence so retry cost is measurable; and
- retained evidence never becomes a Critic PASS, readiness, release, or
  conformance claim by itself.

This is **P2**: it improves review economics after the P1 recovery false-success
boundary is addressed. The owner is the next Pipeline Elephant with review-
economy and receipt-contract scope. Target review date: **2026-08-03**.

## Ownership and expiry

The next Pipeline Elephant owns triage and an accepted implementation package.
The triage due date is **2026-08-03**. If no decision is recorded by
**2026-08-10**, this item expires and must be renewed with current evidence
before further implementation or prioritization.

## Close-retro addendum — 2026-07-21

The recovery-preview quickfix showed that a synchronous duration check can
fail closed after a callback returns, but cannot pre-empt a callback that never
returns. Future retry and recovery evidence must therefore bind the execution
boundary explicitly and distinguish bounded completion from an unavailable or
interrupted transport.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Renewal (2026-08-18):** expired 2026-08-10 with an empty Triage section,
  never triaged in the ~4 weeks since filing — the SAME mistake class this
  session made and corrected for `pipeline.multi-cli-efficiency-pilots`
  (NVA-A8-5): trusting inherited matrix/known-issues prose over the
  defining backlog item itself. Its P1 prerequisite
  (`2026-07-20-recovery-preview-callback-attestation.md`, "the P1 recovery
  false-success boundary") was ALSO expired and untriaged; found to already
  be correctly implemented, independently Critic-reviewed (PASS, this
  session), and closed immediately before this renewal. P2 is therefore
  genuinely unblocked now, not just nominally.
- **Decision:** accepted, current scope, narrowed for a first implementation
  package. Build the retry planner as a new, standalone, independently
  testable library module — a pure decision function, not yet wired into
  Verify's or Critic admission's live retry path. This mirrors the pattern
  already used successfully elsewhere this session (the GMW kernel-closure
  invariant, the execution-plane real-outcome normalizer): build and prove
  the mechanism in isolation first; live wiring into the actual Verify/
  Critic retry call sites is a separate, later, higher-risk follow-up once
  the module itself is accepted and Critic-reviewed. This item's Proposal
  is otherwise ALREADY the design: a deterministic function from (prior
  stage receipts + a new abort event + policy) to a retry plan, per its own
  acceptance-boundary bullets — no further design decision is needed before
  a first implementation package can be dispatched.
- **Rationale:** the acceptance boundary this item already specifies is
  concrete and testable (receipt binding fields, freshness windows, the
  transport/execution/orchestration-vs-domain-finding classification, the
  "retained evidence never becomes a PASS/readiness/release claim by
  itself" invariant) — building it as an isolated module needs no PO input
  and carries far less risk than wiring it live into the gates that
  actually decide Verify/Critic admission on the first pass.
- **Assignment:** goldfish-deep implementation package, dispatched this
  session as `NVA-RETRYECON-1` (see `docs/state.md` for the outcome) — a
  new `plugins/pipeline-core/lib/review-retry-planner.mjs` (name subject to
  the dispatch's own judgment) implementing the acceptance boundary exactly,
  with a full regression suite covering every bullet, and a mandatory
  Critic review before this item can move toward closure. Live wiring into
  Verify/Critic's actual retry call sites is explicitly OUT of this
  package's scope — a distinct, later, separately-triaged follow-up once
  this module itself is accepted.
- **Date:** 2026-08-18

### `NVA-RETRYECON-1` landed and Critic-PASSed — 2026-08-18

`plugins/pipeline-core/lib/review-retry-planner.mjs` (427 lines) +
`review-retry-planner.test.mjs` (327 lines, 17/17 passing, one test per
acceptance-boundary bullet). Implements every acceptance-boundary bullet
above as a pure, unwired decision function: binding drift on candidate/
scope/policy/route/assurance/freshness invalidates and propagates through
declared dependents to a fixpoint; a domain finding always reopens its
domain; an evidenced infrastructure-only abort (`transport`/`execution`/
`orchestration`) retries only the aborted stage and retains every other
still-valid receipt; an unevidenced/unknown cause is representable only as
`unclassified` and fails closed to a full rerun (closing the exact
fraud-shaped gap an unevidenced infrastructure claim would otherwise open);
every per-stage decision is recorded in machine evidence; a retry plan is
structurally unreadable as a PASS/readiness/release/conformance claim (no
verdict vocabulary, no boolean `true` field, `claimAuthority` pinned to
`"none"` and re-validated, no embedded receipt, `isReviewRetryPlan`
exported so a consumer can positively refuse one). Deliberately more
conservative than `verify-resume.mjs`'s ADR-0065 Tier-B path: no
cross-candidate-reuse switch exists or should ever be added here, per this
item's own acceptance boundary and ADR-0065 Decision 8's own release-bound
default. Committed `4d23d8c2`.

Independent Critic review (`a3b9acbf..4d23d8c2`, functional-equivalent-
read-only): **PASS, no findings.** The reviewer independently re-derived
the exact plan-forgery attack the implementor's own first test run had
caught (promote a stage from `rerun` to `retained`, patch `cost`, recompute
the digest) before discovering the test already covered it — confirmed
the anti-forgery cross-check structurally prevents it. Confirmed no live
call site references the new module (`grep` across `plugins/pipeline-core`
and `harness` finds only the module's own test). 17/17 independently
re-run and byte-matched.

**What remains, for whoever picks this up next:** live wiring into the
actual Verify/Critic retry call sites (`harness/scripts/verify.mjs`,
`publication-executor.mjs`, or wherever review-economy retries are
actually decided today) — a separate, higher-risk follow-up, deliberately
out of this package's scope, not yet triaged or assigned. The module and
its test are also not yet registered in `verify.mjs` (by design, since
nothing calls it yet). Status stays `in_progress` until live wiring is
designed, triaged, and lands.

### Update, 2026-08-18 — release-bar triage: live-wiring follow-up decided

- **Decision:** decided, queued for dispatch. The module itself
  (`review-retry-planner.mjs`) is built, tested and Critic-PASSed; what
  remains — wiring it into the actual Verify/Critic retry call sites — was
  left "not yet triaged or assigned" immediately above, which is exactly
  the unresolved-remainder shape the 2026-08-18 release-bar sweep exists
  to close. Scoping it now: the wiring dispatch's job is to call the
  already-accepted, already-tested decision function from
  `harness/scripts/verify.mjs` and/or `publication-executor.mjs` at the
  points where a retry is currently decided ad hoc, and to register the
  module + its test in `verify.mjs`'s own suite enumeration — not to
  redesign the acceptance boundary, which this item's Proposal already
  settled and `NVA-RETRYECON-1` already implemented.
- **Rationale:** live wiring changes what Verify/Critic admission actually
  does on a retry, so it needs its own regression coverage and a
  Critic review before it can be trusted — the same reasoning that kept it
  out of `NVA-RETRYECON-1`'s own scope in the first place. `status` stays
  `in_progress` rather than closing, since the module existing unwired is
  not the same as this item's own goal (bounding retry economics in the
  live gates) being met.
- **Assignment (if accepted):** a follow-up `goldfish-deep` dispatch,
  scoped exactly as above, with a mandatory Critic review before this item
  can move toward closure — matching the same two-step pattern
  (build-in-isolation, then wire-and-review) `NVA-RETRYECON-1`'s own
  Triage already used successfully.

### Wave-1 dispatch attempt, 2026-08-18 (evening) — stopped clean, genuinely blocked, re-queued

A wave-1 dispatch against this item stopped clean with no commit: its
worktree was provisioned from a stale `origin/HEAD`-tracked base
(`2eb4466c`, ~100 commits behind `feat/sprint-nova-codex-v046`'s tip),
so `review-retry-planner.mjs` did not exist anywhere in that checkout —
correctly recognized as a source contradiction with the briefing's own
"already built" premise, and correctly NOT rebuilt from scratch (would
have created a second, divergent, unreviewed implementation). Confirmed
from the primary checkout: the module is real, at `4d23d8c2`
("feat(pipeline-core): add a standalone evidence-bound review-retry
planner") plus a doc-comment follow-up `9fe6e730`, both already on
`feat/sprint-nova-codex-v046`'s tip. The wiring into
`harness/scripts/verify.mjs`/`publication-executor.mjs` and the
suite-enumeration registration — this item's actual remaining scope —
is still genuinely not done. Status stays `in_progress`, not closed.
Re-queued for a wave-2 dispatch with an explicit expected base SHA in
its briefing (the missing ingredient that let the staleness go
unnoticed until the dispatch's own stop-clean report caught it), and the
same TP-3 (`verify.mjs`) constraint as before: prepare and test the
wiring as ready-to-integrate without editing `verify.mjs` itself unless
a signed ceremony is available, and stop clean naming exactly what
remains blocked otherwise.
- **Date:** 2026-08-18
- **Date:** 2026-08-18

### Investigation/Implementation, 2026-08-18 (wave 2, dispatch NVA-W2-6)

Wave-2 dispatch, worktree self-healed to the exact briefed base
(`7eca44ca`) before any work. Read `review-retry-planner.mjs` (427
lines), `harness/scripts/verify.mjs` (593 lines) and
`plugins/pipeline-core/scripts/publication-executor.mjs` (946 lines) in
full, plus `verify-journal.mjs`/`verify-resume.mjs` (Verify's own,
separate, already-wired suite-level resume mechanism, ADR-0065) and
`review-economy.mjs` (the precedent for "registered in `verify.mjs`'s
suite list, actually consumed by a different script" — its decision
functions are called from `codex-critic-host.mjs`/`pipeline-state.mjs`,
neither of which is `verify.mjs`).

**Finding:** neither `harness/scripts/verify.mjs` nor
`publication-executor.mjs` contains an existing ad hoc retry-decision
code path for `planReviewRetry` to replace. `publication-executor.mjs`'s
own docstring states "No generic Git arguments or retry surface exist"
by design — it is a single-shot, security-critical, authority-bound push
executor; its one retry-shaped mechanism (`authority.record.status ===
"executing"`, an in-flight-attempt resume) is a different, already-
handled concept (retrying ONE already-approved push transaction), not
"review or dispatch abort forces a broad repeat run" (the item's own
Description). Introducing a review-retry-planning call site there would
be an architecture change to a security-relevant script, not wiring —
deliberately NOT done here. `review-retry-planner.mjs`'s own STAGES
fixture (`critic-guard`, `critic-docs`, `readiness`) and field vocabulary
(`route` = model/effort, `assurance`) is Critic-review-shaped, not
Verify-suite-shaped; Verify's OWN suite-level retry/resume need is
already served by the separate, mature `verify-resume.mjs`/ADR-0065
mechanism, which the planner's own header explicitly says must stay
independent (no `allowCrossCandidateReuse`-shaped switch).

**Implemented (committed, not TP-3-protected):**
- `harness/scripts/check-review-retry-plan.mjs` — the actual calling
  code. Mirrors `check-phase26-invariants.mjs`/
  `check-phase3-sdlc-coherence.mjs`'s established opt-in shape exactly:
  no `--review-retry-input` argument SKIPs (exit 0, the common case);
  a present argument is read, path-safety-checked (no symlink/traversal/
  absolute path), JSON-parsed, schema-checked
  (`pipeline.verify-review-retry-input.v1`), and passed to
  `planReviewRetry` (`review-retry-planner.mjs`, unmodified). A valid
  plan is written to the git-ignored `evidence/review-retry-plan-latest.json`
  (exit 0); any failure (unsafe path, unreadable, malformed, wrong
  schema, or a `planReviewRetry` rejection) fails closed (exit 1) rather
  than silently no-op'ing past a broken machine-evidence pipeline — this
  is the actual "call the decision function" wiring the item's Triage
  asked for, using the identical pattern this file already uses for
  `PIPELINE_PHASE26_RESULT`/`PIPELINE_PHASE3_RESULT`.
- `harness/scripts/check-review-retry-plan.test.mjs` — 10 tests: flag
  parsing, `DEFAULT_ROOT` sanity, unsafe/symlinked/absolute/traversal
  paths, malformed JSON, wrong schema, a semantically invalid but
  schema-valid request, a valid plan's shape, and the CLI no-argument
  SKIP path (subprocess-spawned; the argument-present CLI paths are
  covered via the exported `checkReviewRetryPlan` function directly
  against an isolated temp root instead, matching
  `check-phase3-sdlc-coherence.test.mjs`'s own precedent for why —
  `DEFAULT_ROOT` resolves against the real checkout, not a spawned
  subprocess's `cwd`).
- `node --test` run for both: 10/10 new tests pass; the pre-existing
  `review-retry-planner.test.mjs` re-run unchanged at 17/17.

**Blocked at the TP-3 boundary (verify.mjs), exact edits below —
reported as `pendingProtectedEdit`, not attempted:** three hunks —
(A) a `PIPELINE_REVIEW_RETRY_INPUT` env-var constant alongside the
existing `phase26Result`/`phase3Result` constants; (B) a
`review-retry-planner-tests` suite entry (the module's own test,
registering `review-retry-planner.mjs` itself per the Triage's explicit
instruction) placed after `review-economy-tests`; (C) a
`review-retry-plan-tests` + `review-retry-plan-check` suite-entry pair
(mirroring the `phase26-invariants-tests`/`-check` pair exactly,
including the conditional `args`) placed after the `phase26-invariants-*`
entries. One confirmatory edit attempt was made (the import-only hunk)
to obtain the exact guard diagnostics: `TP-3` (`guard-testpath`),
request-sha256 `7eb43004198fe302a2c3d1e9496bcec870c2814b83250aa8d13d95c3858bfa35`,
blocked pre-execution, no mutation applied (confirmed via `git diff`).
No override was attempted. The three hunks touch non-adjacent regions
of `verify.mjs`, so applying them needs either three separate signed
edits or one edit whose `old_string` spans the full region between them
(CLAUDE.md's own guidance on this).

**Still not done, out of this dispatch's authority:** applying the
three `verify.mjs` hunks above (needs a signed human-guard-override
ceremony against this exact repo, run by whoever has the external Ed25519
key — not this dispatch). Once applied and Verify itself confirms green,
this item's remaining scope is fully closed. Status stays `in_progress`.
- **Date:** 2026-08-18
