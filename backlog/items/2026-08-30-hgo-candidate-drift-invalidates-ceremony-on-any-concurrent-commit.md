---
schema: pipeline.backlog-item.v1
id: pipeline.hgo-candidate-drift-invalidates-ceremony-on-any-concurrent-commit
type: defect
owner: pipeline
status: open
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

## Triage

- **Decision:** accepted, Nova A
- **Rationale:** PO-prioritized 2026-08-30; live-reproduced same session,
  not merely inferred from report text; directly costs PO signature effort
- **Date:** 2026-08-30
