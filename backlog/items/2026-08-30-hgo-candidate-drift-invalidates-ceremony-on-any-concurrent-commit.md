---
schema: pipeline.backlog-item.v1
id: pipeline.hgo-candidate-drift-invalidates-ceremony-on-any-concurrent-commit
type: defect
owner: pipeline
status: closed
closed_at: 2026-08-30
closure_repository: self
closure_commit: 67f6e1c3807520d4e7bfa7ad40e81063fe9b5840
closure_evidence: plugins/pipeline-core/lib/human-guard-override.test.mjs
created: 2026-08-30
sprint: nova
tracking: "NOW / Nova A -- surfaced 2026-08-30, reproduced live in this session: a background trust-anchor-fix dispatch's commit 6876ba53 invalidated an in-flight hooks.json TP-4 signature ceremony, requiring refreeze-plan and a second PO signature for the identical edit."
source: "Claude-060-78 and Codex-060-77 greenfield retrospectives both flag digest/command-drift loops during the signing ceremony; live reproduction 2026-08-30 in this session confirms the general mechanism, not just a report claim."
---

# A `guard-human-override.mjs` signature ceremony's frozen plan is invalidated by ANY commit landing on HEAD, including an unrelated concurrent one

## What happened

`guard-human-override.mjs`'s `plan`/`prepare-authorization`/
`emit-signature-digest` chain binds the ceremony to the repository's exact
current HEAD SHA. If ANY commit lands on HEAD between seeding the request
and consuming `authorize-by-signature` -- not just the operator's own
action, but also an unrelated concurrent background dispatch's commit --
`authorize-by-signature` refuses with `HGO-CANDIDATE-DRIFT`, discarding the
already-obtained PO signature and forcing a `refreeze-plan` +
`prepare-for-signature` + a brand-new PO signature for the byte-identical
edit.

**Live reproduction, 2026-08-30 (this session):** a hooks.json TP-4 ceremony
(backlog item 30, wiring `guard-worktree-isolation.mjs`) was planned and the
PO signed the resulting intent digest. Before that signature could be
consumed, an unrelated background dispatch (`NVA-CF-TRUSTANCHOR-TOFU`)
completed and committed its own, completely unrelated fix (`6876ba53`),
moving HEAD. `authorize-by-signature` refused with `HGO-CANDIDATE-DRIFT`.
Recovery required `refreeze-plan` (new plan digest bound to the new HEAD),
`prepare-for-signature` (new intent digest), and a SECOND live PO signature
for the identical edit -- costing a real passphrase entry for a ceremony
that had nothing to do with the concurrent commit.

Both the Claude and Codex greenfield retrospectives independently flagged
"digest/command drift loops" during the signing ceremony as a friction
point; this live reproduction confirms a concrete, reproducible mechanism
behind that class of complaint, not just an isolated occurrence.

## Impact

Any concurrent background work in the same repository (a dispatched
Goldfish landing an unrelated commit, an autonomous loop, another session)
can silently cost the PO an extra signature for a ceremony they already
signed once, with no warning before the fact.

## Proposal (not prescriptive -- needs real design)

Consider whether the binding needs to be this strict. Options worth
evaluating: (a) bind to the exact PRE-IMAGE of the target file/path rather
than the whole-repository HEAD SHA, so an unrelated file's commit does not
invalidate the ceremony; (b) detect the "unrelated" case (the target path's
blob is unchanged between the two HEADs) and auto-refreeze without
requiring a second signature, since a byte-identical target file means no
new authority is actually being granted; (c) at minimum, warn BEFORE asking
for a signature if other dispatches are in flight that could commit before
consumption, so the operator can choose to wait.

## Acceptance criteria

- A concurrent, unrelated commit (touching different files than the
  ceremony's target) no longer forces a second PO signature for the same
  edit -- OR, if the binding is kept strict by design, the reason is
  explicitly documented and an operator is warned in advance rather than
  discovering it after already signing once.

## Closed, 2026-08-30 (NVA-CF-HGOCANDIDATEDRIFT)

Investigated whether the whole-repository-tree HEAD binding (option a/Bar 1)
could be safely narrowed to just the target path's content. Found that
`signedCandidate: {commit, tree}` is not only an internal freshness check --
it is baked directly into the PO's own Ed25519-signed intent
(`createPoApprovalIntent()` in `po-approval-proof.mjs`), and the frozen plan
also freezes a safety analysis of the specific override being granted
(`eligiblePaths`/`preview`/`denials`) that is never recomputed at arm time.
Narrowing the binding would change what the PO cryptographically attests to
and requires proving no other part of the tree can affect that frozen
analysis (symlink placement, path classification elsewhere in the tree) --
not a claim this dispatch could confidently verify. Resolved via the
explicitly-permitted fallback (Bar 2, this item's own acceptance criteria):

- **Documented why the binding stays strict**, in code (the
  `HGO-CANDIDATE-DRIFT` `fail()` site in `lib/human-guard-override.mjs`) and
  operator-facing (`docs/push-release-flow.md`, new section "The identical
  binding applies to `guard-human-override.mjs`'s general override
  ceremony").
- **Warned in advance, not only after the fact:** `guard-human-override.mjs
  plan` now prints an always-on ADVISORY on stderr naming the drift risk
  every time it is run, before a signature is ever requested.
- **Cheap in-flight signal, investigated and implemented:** a new
  `concurrentWorktreeAdvisory()` helper (`lib/human-guard-override.mjs`,
  advisory-only, never touching the request/plan/capability JSON shape or
  hash preimage) runs `git worktree list` and escalates `plan`'s advisory
  when other worktrees are present. Explicitly a partial signal only -- it
  does not detect a concurrent commit landing directly into the SAME
  (shared, non-worktree-isolated) checkout, which the operator-facing note
  states plainly.

Commit `67f6e1c3`. Regression tests added: 3 lib-level
(`concurrentWorktreeAdvisory()` behavior, incl. a non-throwing failure path)
and 2 CLI-level (`plan`'s stderr advisory, with and without another
worktree present) -- `plugins/pipeline-core/lib/human-guard-override.test.mjs`
(97/97 pass) and `plugins/pipeline-core/scripts/guard-human-override.test.mjs`
(17/17 pass), zero regressions in either full suite.

## Triage

- **Decision:** accepted, Nova A
- **Rationale:** PO-prioritized 2026-08-30; live-reproduced same session,
  not merely inferred from report text; directly costs PO signature effort
- **Date:** 2026-08-30
