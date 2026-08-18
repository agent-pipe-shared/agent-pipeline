---
schema: pipeline.backlog-item.v1
id: pipeline.orchestrator-authored-production-commits-have-no-deterministic-control
type: defect
owner: pipeline
status: open
created: 2026-08-08
due: 2026-08-22
source: "Critic delta re-review v2, 2026-08-08 (backlog/evidence/2026-08-08-critic-delta-v2-verdict.md, Findings A and B). The pattern recurred nine minutes after the commit that acknowledged it."
---

# Two lifecycle rules are enforced only by a reviewer reading history afterwards

## The observation

The Critic's delta re-review of the GF-056 remediation found a fresh instance of the
very finding the delta was remediating. `c8e5edf` is a production change to
`plugins/pipeline-core/scripts/po-human-approval.mjs` — what the approval record
contains, so security-relevant — committed by the orchestrator after the SETUP-1
dispatch ended without committing its own diff. `11ae7e7`, which owns exactly this
pattern from the previous batch, landed **nine minutes earlier in the same delta**.

That timing is the whole point of this item. The correction applied last time was a
written acknowledgement plus an intention. It survived nine minutes.

A second, smaller instance in the same delta: `6decf59` uses the commit type
`design`, which `guardrails/git.md:16` (GIT-01) does not admit. Nothing deterministic
caught that either — `commit-message-policy-tests` unit-tests the policy module, it
does not check commit subjects in a range.

## Why they belong in one item

Both are prose rules whose only enforcement is a Critic reading history after the
fact. That works — it caught both — but it works *late*: after the commit exists, at
which point the hard rule against rewriting history means the finding can only ever
be recorded, never fixed. An enforcement that can only produce records is an audit
trail, not a control.

The two differ in difficulty, and the difference matters:

- **The commit type is decidable from the message alone.** A subject line either
  starts with an admitted type or it does not.
- **The authorship rule is not decidable from the commit.** "Was this diff authored
  by a dispatch?" is not a property of the diff. The trailer is a claim, and GIT-03
  deliberately makes it optional, so its absence proves nothing.

## Direction, not a design

1. **Do the decidable one first and separately.** A commit-message type check, run
   where commit messages actually pass — the same place the existing message policy
   already lives. Small, deterministic, no judgement.
2. **For authorship, do not reach for a trailer requirement.** Making `Dispatch:`
   mandatory converts an honest optional signal into a field that gets filled in to
   pass a check. The failure mode this repository already observed — a dispatch
   reporting a record it never wrote
   (`2026-08-08-a-dispatch-reported-creating-a-record-it-never-created.md`) — is
   exactly what happens when a claim becomes a gate.
3. **Ask instead what makes the orchestrator commit production diffs at all.** In
   both observed cases the reason was the same: a dispatch produced a correct diff
   and then ended without committing it — once because a guard structurally prevented
   it, once because the run ended first. The orchestrator was completing work that
   was already done. So the control that would actually bite is upstream: a dispatch
   that cannot commit should not be the normal case, and a dispatch that ends with an
   uncommitted diff should be a visible, typed outcome rather than something the
   orchestrator quietly finishes.
4. **Whatever is built must not block the OM §3.3 stage-0 fast path**, which
   legitimately allows the orchestrator small fixes. The distinguishing property is
   not who typed it but whether the change is trivial — and that is a judgement, which
   is precisely why direction 3 attacks the cause rather than the symptom.

## What is explicitly not the fix

Rewriting history to add trailers. Excluded by hard rule, and it would make the
record less true rather than more.

## Related

- `backlog/evidence/2026-08-08-critic-delta-v2-verdict.md` — the findings as written.
- `backlog/evidence/2026-08-08-critic-gf056-verdict.md` — the prior instance, and the
  acknowledgement that did not hold.
- `2026-08-08-long-dispatches-truncate-before-emitting-their-report.md` — the upstream
  cause named in direction 3.
- `2026-08-08-a-dispatch-reported-creating-a-record-it-never-created.md` — why a claim
  must not be turned into a gate.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:** Same bundled decision as
  `2026-08-07-mp22-orchestrator-self-implementation-has-no-enforcement.md`
  for the authorship-control question (direction 2/3 here): decline a
  technical enforcement gate, attack the cause instead. Direction 1 (a
  decidable commit-message-type check, independent of the authorship
  question) is NOT covered by this decision — not asked, not answered,
  stays open.
- **Rationale:** PO, 2026-08-11: "D" on the grouped enforcement-mechanism
  cluster. This item's own direction 3 ("ask instead what makes the
  orchestrator commit production diffs at all... a dispatch that ends with
  an uncommitted diff should be a visible, typed outcome") is exactly the
  accepted direction, independently arrived at by this item before the PO's
  decision. Direction 4 (must not block the OM §3.3 stage-0 fast path)
  stands as a constraint on whatever the eventual re-dispatch-path design
  produces.
- **Assignment (if accepted):** Unassigned, same design pass as the mp22
  item. Direction 1 (commit-type check, `guardrails/git.md` GIT-01) is a
  separate, small, decidable fix that could proceed independently but has
  not been asked about or approved — flag for a future explicit decision,
  do not bundle into the enforcement-mechanism design.
- **Date:** 2026-08-11

### Update, 2026-08-18 — release-bar triage: direction 1 decided

- **Decision:** decided, queued for dispatch. Direction 1 (a decidable
  commit-message-type check for a delivery/review range, independent of
  the authorship-control question above) was flagged in the 2026-08-11
  triage as "not covered by this decision... stays open" and never
  actually decided. Confirmed against current source before deciding:
  `plugins/pipeline-core/lib/commit-message-policy.mjs` implements GIT-03
  (correlation-trailer privacy + `AI-Assisted:` marker) as a per-commit
  PreToolUse check; it does not check the GIT-01 type vocabulary
  (`guardrails/git.md:16`) at all, and nothing in the repository checks
  commit subjects across a range (`guard-git.mjs` is a PreToolUse hook on
  one command, not a range walker). The gap this item's Description
  reported (`6decf59`'s `design` type going uncaught) is therefore still
  real, unchanged since 2026-08-08.
- **Rationale:** the check is genuinely decidable (a subject line either
  starts with an admitted GIT-01 type or it does not) and small, but
  wiring it into a guard/hook or a range-checking script is guardrail-tier
  work (touches `plugins/pipeline-core/hooks/guard-git.mjs` and/or
  `harness/scripts/verify.mjs`) and needs a regression suite to be trusted
  — not a change this read-only triage pass can make itself.
- **Assignment (if accepted):** a small `goldfish-implementor`/`goldfish-
  mechanic` dispatch: extend `commit-message-policy.mjs` (or a thin
  sibling module) with a pure `commitTypeFindings(subject)` check against
  the GIT-01 vocabulary, wired wherever commit messages already pass
  today, plus a range-mode entry point Critic/Verify can call against an
  enumerated commit set. Sprint Alfred — same "mechanical governance"
  scope as the authorship-control question this item's own primary
  decision already assigned there.
- **Date:** 2026-08-18
