---
schema: pipeline.backlog-item.v1
id: pipeline.ledger-backed-plan-and-push-authority-absent-on-merged-base
type: defect
owner: pipeline
status: open
source: merge report section 4 findings 1/2/4/5/6/11 (specs/sprint-phoenix-epic/evidence/merge-0.5.2-what-fell-away.md gitignored evidence artifact); merge commit 75b8361
created: 2026-08-07
---

# The PHX-2 Human Governance Decision Ledger has no equivalent on the merged base

## Description

Merging `origin/main` 0.5.2 into `sprint_phoenix` (local commit `75b8361`,
not pushed) resolved 28 competing code conflicts to main's implementation per
PO direction (same guardrail/authority mechanism, independently
re-implemented on both sides — main wins, Phoenix's version documented as
lost). Six of those losses are one coherent subsystem, not six unrelated
ones: Phoenix's ledger-backed human-governance-decision authority for plan
approval and pushes.

Gone from the merged tree:
- `harness/lib/plan-spec-state-v2.mjs` — `bindPlanSpecApprovalWithHumanDecision`,
  ledger-first v3 plan approval bound to an independently-resolved
  human-decision reference.
- `harness/scripts/pipeline-state.mjs` — the Recovery Bridge / feature-package
  / continuity-authority-revision / human-decision-consumption governance-
  ledger subsystem (~1,400 lines on the Phoenix side).
- `plugins/pipeline-core/hooks/guard-devplan.mjs` —
  `hasLedgerBackedPlanApproval`, an external single-use governance-authority
  readback required before honoring `planApproved`; main trusts local
  content-hash verification only.
- `plugins/pipeline-core/hooks/guard-git.mjs` — override consumption scoped
  to `governance-authority.mjs` (bound to the exact guard file's own
  sha256), replaced by main's plain local-file ledger.
- `plugins/pipeline-core/hooks/guard-push.mjs` — `checkLedgerPushAuthority`,
  the actual enforcement mechanism for what CLAUDE.md's own Hard Rules
  described as the sole future remote-action exception path. **This is the
  single most consequential loss in the whole merge.**
- `plugins/pipeline-core/skills/pipeline-start/SKILL.md` — the agent-facing
  documentation of the PHX-2 fail-closed remote-authority contract, paired
  with the guard above.

Main instead governs pushes via `gates.push_approval` (ADR-0056, `signature`
or `chat` mode) — already implemented, and CLAUDE.md's Push Policy paragraph
was resolved to describe that mechanism during the merge (dropping the PHX-2
description). Since PHX-2 was never built on either side before the merge,
nothing regresses in practice — but every remaining "PHX-2" reference in this
repo's docs now names a mechanism the merged codebase does not implement.

## Triggering situation

`git merge origin/main` into `sprint_phoenix` (2026-08-07), PO-directed
integration of the real 0.5.2 release candidate. Full per-file loss
accounting and resolution policy in the merge report cited above.

## Affected artifact

`plugins/pipeline-core/hooks/guard-push.mjs`, `guard-git.mjs`,
`guard-devplan.mjs`; `harness/lib/plan-spec-state-v2.mjs`;
`harness/scripts/pipeline-state.mjs`;
`plugins/pipeline-core/skills/pipeline-start/SKILL.md`; CLAUDE.md's Push
Policy paragraph (already repointed to ADR-0056 in the merge).

## Proposal

**PO decision (APS, 2026-08-07):** adopt main's `signature`/`chat`
`gates.push_approval` model (ADR-0056) as the governing baseline — it is
already implemented and already what the merged tree runs. PHX-2 is not
retired as a concept; it becomes follow-on work that extends and optimizes
this baseline rather than replacing it. Concretely this means: design PHX-2's
ledger-backed plan/push authority as an additive layer on top of main's
`gates.push_approval` mechanism (e.g. an extra ledger-backed proof consumed
alongside the signature/chat gate, not a competing enforcement path), not as
a from-scratch resurrection of the pre-merge Phoenix implementation against
the old base. Scope, sequencing, and which of the six affected files get
touched first are still open — this decision fixes the *direction*, not the
implementation plan.

**Design phase (2026-08-07):** a scoped design was produced — commit `ad49c48`,
`specs/sprint-phoenix-epic/design/phx-2-additive-ledger-authority.md`.
**Critic review: FAIL.** Full findings:
`specs/sprint-phoenix-epic/evidence/wp5-phx2-design-critic-review-ad49c48.md`
(gitignored evidence artifact). Three MAJOR findings, none fatal to the
approach: (1) `repositoryFingerprint` sourced from the wrong root, breaking
worktree-invariance for the exact threat the design claims to close; (2) the
write mechanism omits directory creation, guaranteeing `ENOENT` on first use
everywhere, with recovery blocked behind an unrelated existing guard; (3) the
integration point is structurally unreachable in `chat` mode, contradicting
the design's own "alongside the signature/chat gate" framing. Plus two MINOR
findings.

**Rework (2026-08-07):** commit `8a54751` (doc-only, +172/−37 lines) fixes all
five findings: F1 now derives `repositoryFingerprint` from
`discoverRepository(...).primaryRoot`/`.commonDir`, matching every real call
site of `derivePoGateRepositoryFingerprint` in the codebase, and removes the
false "existing git-common-dir resolution" comment; F2 adds the missing
`mkdirSync(dirname(path), { recursive: true, mode: 0o700 })` before the `wx`
write plus a new §4 write-side failure-mode entry (write failure is fatal to
`approve-push`, with the disclosed manual-recovery cost); F3 is resolved by
narrowing scope rather than extending coverage — §1 now states prominently
that this design engages only for `signature`-mode-configured projects, and
that `chat`-mode projects get zero benefit until a follow-up design (extending
coverage would require inventing a `chat`-mode consumption key and single-use
semantics that don't exist even locally today, which is materially more than
"smallest additive mechanism" calls for); F4 reframes the "no encryption"
justification around tamper-resistance rather than secrecy; F5 adds a
non-local-filesystem (NFS) caveat to the atomicity claim. Diff snapshot:
`specs/sprint-phoenix-epic/evidence/wp5-phx2-design-rework-diff-ad49c48-8a54751.txt`
(gitignored). A bounded delta Critic re-review (base `ad49c48`, head
`8a54751`, prior finding IDs F1–F5, per `critic-review.md`'s Phase-2.6
mechanism) is dispatched — not implementation yet.

**Delta re-review 1 (2026-08-07): FAIL.** Full findings:
`specs/sprint-phoenix-epic/evidence/wp5-phx2-design-critic-delta-review-1-8a54751.md`.
F1–F5 all genuinely resolved; the F1 fix itself introduced a new MAJOR
(unguarded `discoverRepository(...)` call with no try/catch in
`guard-push.mjs` — an uncaught throw exits the hook at code 1, which the
hook's exit-code contract treats as ALLOW, discarding every other
accumulated push-gate failure) plus 3 MINOR. A narrowly-scoped second rework
(F-A/F-B/F-C/F-D only) was dispatched.

**Second rework (2026-08-07): landed, commit `099a31b`.** Wraps both
`discoverRepository(...)` calls in try/catch with an explicit fail-closed
`PUSH-EXTERNAL-LEDGER-TOPOLOGY-UNRESOLVED` disposition (F-A); withdraws the
ADR-0029-forbidden manual-hand-edit recovery option, leaving a fresh signing
ceremony as the sole recovery path (F-B); adds a distinct `EEXIST` →
`PUSH-EXTERNAL-LEDGER-ALREADY-CONSUMED` taxonomy entry, the mechanism's own
replay signal rather than a retryable condition (F-C); corrects the
"one universal primitive, already imported" overclaim — two related
worktree-invariant primitives exist, and `discoverRepository` is a net-new
import at both integration points (F-D). F1–F5's prior resolutions are
unchanged.

**Process note:** this rework's content was produced by dispatch
`WP5-phx2-design-rework-2`, but its own commit attempt was absorbed by a
concurrent, unrelated Elephant-session commit via a shared-index race
(staging + committing were not atomic across the two sessions on the same
live checkout). The dispatch's own scratchpad `dispatch-record.json`
correctly self-diagnosed the collision and verified its content
byte-for-byte against its intended diff rather than silently reporting
success. The Elephant split the colliding commit locally (`git reset --soft`,
unpushed, nothing lost) into `099a31b` (the design-file change, carrying the
proper `Dispatch: WP5-phx2-design-rework-2 (goldfish)` trailer) and a
separate docs-only commit — restoring correct authorship attribution before
the next Critic pass, since the Critic contract's authorship check (EL-01/
EL-16) depends on it. A second bounded delta Critic re-review (base `8a54751`,
head `099a31b`, prior finding IDs F-A/F-B/F-C/F-D) is dispatched next —
Critic round 3 of the 4 allowed for this package (initial + delta 1 + delta 2).

**Delta re-review 2 (2026-08-07): FAIL.** Full findings:
`specs/sprint-phoenix-epic/evidence/wp5-phx2-design-critic-delta-review-2-099a31b.md`.
F-B/F-C/F-D genuinely resolved (F-D's full 9-site call inventory
independently re-derived and matched exactly); F-A's read side genuinely
fail-closed. But the F-A write-side fix introduces a new MAJOR: it asserts
three times that the `discoverRepository(dir)` catch fires BEFORE the local
state write, contradicting §2's own unchanged placement instruction ("only
if that local write succeeded" — i.e. AFTER), leaving that case's recovery
paragraph built on a false "state untouched" premise with no actual recovery
path. Plus 3 MINOR (a read-side taxonomy entry citing a return code the
called function can't produce; a false "established `5000`ms" claim for
`pipeline-state.mjs`, which has no uniform timeout convention; a dispatch-
record/commit-trailer provenance mismatch — explicitly NOT a lifecycle
violation, since design-spec diffs are permitted direct Elephant output
either way). A third, narrowly-scoped rework (fix the ordering claim + 3
minors) is dispatched next — **this is Critic round 4 of the 4 allowed for
this package; if it also fails, this needs a PO course gate, not a fifth
autonomous iteration.**

**Third rework (2026-08-07): landed, commit `6f191ee`.** Corrects the
write-side `discoverRepository(dir)` catch's ordering claim to match §2's
own unchanged placement instruction (the catch fires AFTER the local state
write has already succeeded, not before) and extends the recovery paragraph
so this sub-case shares the same "fresh signing ceremony" recovery framing
already given for the filesystem-condition sub-case (Finding 1); re-notates
the §4 read-side entry to the actual `failures.push` free-text message shape
instead of a return code the called function never produces on that path
(Finding 2); corrects the timeout paragraph — the `5000`ms convention is
`guard-push.mjs`'s own, not `pipeline-state.mjs`'s (which has no uniform
timeout convention across its 7 git spawns) — while still recommending
`5000`ms at both new call sites for cross-file consistency (Finding 3);
Finding 4 (a commit-metadata provenance mismatch, not document content)
required no document change. F1-F5 and F-B/F-C/F-D remain intact. A bounded
delta Critic re-review (base `099a31b`, head `6f191ee`, prior finding IDs
1-4) is dispatched next — **Critic round 4 of 4, the last one allowed under
this package's cap.**

**Delta re-review 3 / round 4 (2026-08-07): FAIL — round cap reached, PO
decision needed.** Full findings:
`specs/sprint-phoenix-epic/evidence/wp5-phx2-design-critic-delta-review-3-6f191ee.md`.
Finding 1 (the MAJOR ordering fix) is genuinely and correctly resolved —
independently re-derived from `pipeline-state.mjs` source, not from the
document's claim. Findings 2 and 4 are cleanly resolved. What fails the
package: 2 new MINOR documentation-self-consistency defects, confined to
§4's prose, with **no design, control-flow, or security consequence** — (A)
a recovery-paragraph appositive says "the two" write-side failure points
share a property that all three actually share, and a stale scoping phrase
elsewhere wasn't updated to match a related rewrite; (B) the timeout
paragraph's "guard-push.mjs's own two existing git spawns" underclaims —
the real count is 20, all uniformly `5000`ms, so the paragraph's
recommendation is if anything better-supported than stated, just misquoted.

Per `critic-review.md`'s Phase-2.6 cap (initial + 3 deltas = 4 rounds max),
this now requires a **PO course gate**, not a further autonomous rework. The
Critic's own input to that gate: exact remaining fix is two sentence-level
corrections at 4 specific line ranges, nothing else implicated — offered as
input, not as a decision it's authorized to make. **Decision pending.**

**Delta re-review 1 (2026-08-07): FAIL.** Full findings:
`specs/sprint-phoenix-epic/evidence/wp5-phx2-design-critic-delta-review-1-8a54751.md`.
F1–F5 are all genuinely resolved, but the F1 fix itself introduces a new
MAJOR defect (F-A): both integration points now call `discoverRepository(...)`
unguarded, and `guard-push.mjs` has no try/catch around either call site —
per the hook's own documented exit semantics, an uncaught throw exits 1,
which *allows* the push and silently discards every other already-accumulated
push-gate failure, the exact opposite of §4's "fail closed" commitment. Plus
3 MINOR findings (F-B: the write-side recovery path prescribes a hand-edit
ADR-0029 forbids outright; F-C: the write-side failure taxonomy omits
`EEXIST`, the mechanism's own core replay signal; F-D: the F1 justification's
"every real call site" claim overclaims — two of seven cited sites actually
go through a different primitive, `resolvePoGateRepositoryTopology`, not
`discoverRepository`). Remedy is narrow (wrap both derivation calls, add a
fail-closed taxonomy entry, correct 3 claims) — does not touch the approach.
A second, narrowly-scoped rework (F-A/F-B/F-C/F-D only) is dispatched next,
followed by a second bounded delta re-review — Critic round 3 of 4 allowed
for this package.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:** accepted (direction only — main's model is the baseline;
  PHX-2 extends it)
- **Rationale:** PO decision, 2026-08-07 (APS): main's signature/chat model
  is already implemented and already governs the merged tree; nothing
  regresses by keeping it. PHX-2 was never built on either side, so building
  it as an addition rather than a replacement avoids re-litigating a working
  mechanism.
- **Assignment (if accepted):** redesign round, not yet scheduled to a
  phase/release.
- **Date:** 2026-08-07
