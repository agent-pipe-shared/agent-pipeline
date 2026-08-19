---
schema: pipeline.backlog-item.v1
id: pipeline.critic-review-round-cap-has-no-durable-home-and-two-inconsistent-values-circulate
type: defect
owner: pipeline
status: closed
created: 2026-08-18
source: "Incremental handover-rotation extraction pass (ADR-0066 Decision 6/7), 2026-08-18, second rotation batch (2026-08-17 continued entries). Finding surfaced by a read-only research fork."
---

# The "Critic review round cap" policy is never codified in any repo artifact, and this session's own history shows two inconsistent values in circulation (one round vs. two)

## Description

`docs/state.md`'s second rotation batch shows the session operating on two
different, mutually inconsistent assumptions about how many Critic review
rounds are allowed before self-verifying a fix instead of re-dispatching:

- Several earlier points assume a **two-round cap** ("round 2 of the
  2-round cap", "per the 2-round cap: if either FAILs, self-verify the
  rework rather than a 3rd dispatch").
- A later point states, as if newly settled and PO-confirmed live: **"one
  Critic round per package, then self-verify — no automatic second
  dispatch even on FAIL."**

Checked `guardrails/`, `CLAUDE.md`, and `docs/operating-model.md` for any
codified round-cap number — no match for "round cap", "Critic round", "one
Critic round", or "two-round" anywhere in those files. The only place
anything like this rule lives is this AI's own personal cross-session
memory (`feedback-cap-critic-review-rounds-at-two.md`), which says "two" —
directly contradicting the later "one round" value this same session
recorded as PO-confirmed. Since memory is not a repo-committed artifact
another agent or a future session can read, and the two numbers disagree,
this is a real, load-bearing policy that currently exists nowhere
authoritative.

## Triggering situation

Incremental extraction pass over `docs/state.md`'s second rotation batch
before that content is archived (ADR-0066 Decision 6/7). The two
inconsistent values were found within the SAME reviewed line range,
confirming this is not merely stale memory vs. current practice but an
actual in-session inconsistency.

## Affected artifact

`docs/operating-model.md` §4 (review system) is the most natural home for
a Critic-round-cap policy; `CLAUDE.md` if it should be a Hard Rule instead.
This AI's own `feedback-cap-critic-review-rounds-at-two` memory file will
need updating once the real, current PO-intended number is confirmed and
written to a repo artifact.

## Proposal

Not yet designed in detail. First step is a PO decision on the actual
intended cap (one round then self-verify, or two rounds then self-verify,
or something else / package-type-dependent), then write that decision into
`docs/operating-model.md` §4 as the authoritative source, and correct the
stale memory file to match.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:** decided 2026-08-18 (PO decision #5, option A) — "1 initial
  Critic round + 1 re-review round" is the standing durable rule; see the
  "PO-decision implementation" section below for where it is now codified.
- **Rationale:** materially affects review cost/thoroughness trade-offs
  session to session; a genuine PO-scope decision, not an Elephant call.
- **Date:** 2026-08-18

### PO-decision implementation, 2026-08-18 (wave 3, dispatch NVA-W3-3)

**Decision implemented:** PO decision 2026-08-18 (decision #5), option A —
codified "1 initial Critic round + 1 re-review round" (two Critic dispatches
total per package before self-verify takes over) as the standing durable
rule.

**Where it now lives (single canonical source):**

- `guardrails/quality-gates.md` QG-13 ("Critic review round cap: one initial
  round, one re-review round") — the actual number and the MUST/MUST NOT
  text.
- `docs/operating-model.md` §6 ("Evidence, review and recovery") — a
  one-sentence cross-reference pointing to QG-13, so the "review system"
  section (the item's own first-nominated home) surfaces the rule without
  duplicating the number.
- Vendored copy `plugins/pipeline-core/guardrails/quality-gates.md`
  regenerated via `node harness/scripts/generate-vendored-canon.mjs` so the
  hosted-plugin copy matches its origin byte-for-byte (confirmed with
  `diff`, no output).

**Checked for the "two inconsistent values" claim, per file named in the
decision:**

- `CLAUDE.md`: no existing round-cap statement found (grepped for "round
  cap", "Critic round", "review round", "re-review", "2nd/3rd dispatch") —
  nothing to correct.
- `roles/critic.md`: no numeric round-cap statement found; the only "round"
  reference is the unrelated "Bounded review mode" provision (full-vs-delta
  scoping of a single Critic dispatch, not a dispatch-count cap) — left
  untouched, not in conflict.
- The AI's personal cross-session memory value ("cap Critic review rounds
  at two ... self-verify instead of a 3rd dispatch") is actually
  CONSISTENT with the now-codified value (1 initial + 1 re-review = 2
  total, then self-verify) — no correction needed there; not touched
  (personal memory is outside repo/DoD scope for this dispatch regardless).

**New, out-of-scope finding surfaced during implementation (not resolved
here):** `harness/review-protocol.md` §3 carries a related but numerically
different, pre-existing rule: "Rule (cycle cap): Max 3 fresh local rework
cycles per task" plus "Rule (re-review): ... mandatory triggers → a NEW
fresh Critic run" for every rework cycle — read literally, this
allows/requires up to ~4 total Critic dispatches (initial + up to 3
re-reviews) before a mandatory PO course-gate escalation, a different
ceiling from the "1 initial + 1 re-review, then self-verify" rule just
codified. This tension was not part of this item's originally described
scope (the item's own search checked only `guardrails/`, `CLAUDE.md`,
`docs/operating-model.md`) and reconciling the two is a design decision
beyond "write down the already-made decision" — flagged here for a
follow-up PO/Elephant look, not resolved by this dispatch.

**Also discovered, unrelated to this item's substance:** `node
harness/scripts/generate-vendored-canon.mjs --check` fails at the base
commit (`6cececb23dc9f30788664083b2dcd67db7e4e7ff`) even before this
dispatch's own edits, with pre-existing drift in
`plugins/pipeline-core/guardrails/git.md`,
`plugins/pipeline-core/docs/push-release-flow.md`,
`plugins/pipeline-core/docs/adr/0056-push-approval-mode.md`, and
`plugins/pipeline-core/roles/elephant.md` (their repo-root originals were
edited without a corresponding regeneration). Confirmed by reverting those
4 vendored files to their committed content and re-running `--check`: they
still report stale. Left untouched (out of this dispatch's scope) —
reported here for the orchestrator to file/track separately.

## Closure, 2026-08-19

The follow-up finding this item was left open for — `harness/review-protocol.md`
§3's inconsistent "max 3 fresh local rework cycles" / up-to-4-Critic-dispatches
reading — was resolved with a fresh PO decision: QG-13 governs (commit
`6af5cab7`). All three stale count references in `review-protocol.md`
(§3's cycle-cap rule, and both cells of the §4 escalation-ladder table row)
now defer to QG-13 by reference instead of restating a number, and the
escalation-ladder wording was corrected to match QG-13's actual mechanism
(exceeding the cap routes to Elephant self-verification, not automatically
to a PO escalation). The protected-preimage pin for this file was
re-verified byte-for-byte and updated through the file's own documented
process (independently recomputed sha256, not copied from a test
assertion). The separately-noted `generate-vendored-canon.mjs --check`
pre-existing drift finding is unrelated to this item's substance and was
already resolved elsewhere this session (the canon regeneration work
earlier in this session's history). Closing.

**Evidence:**

- `node --test harness/scripts/check-doc-contracts.test.mjs` — 36/36 pass
  (exit 0).
- `node --test harness/scripts/generate-vendored-canon.test.mjs` — 5/8
  pass; the 3 failures (AC-1, AC-1b, AC-7) are the pre-existing, unrelated
  drift named above (confirmed present before this dispatch's changes), not
  caused by this change; the vendored
  `plugins/pipeline-core/guardrails/quality-gates.md` copy itself is
  confirmed byte-identical to its origin (`diff`, no output).
- `git diff --stat` for this dispatch's commit:
  `docs/operating-model.md`, `guardrails/quality-gates.md`,
  `plugins/pipeline-core/guardrails/quality-gates.md`, plus this backlog
  item file.

**Status:** left as `open` (not closed) — the item's own originally
described inconsistency (`docs/state.md`'s "one vs. two" values, with no
codified home) is now resolved, but the newly-surfaced
`harness/review-protocol.md` tension above is a genuine, unresolved
widening of the same underlying policy question and should be looked at
before this item is considered fully closed.
