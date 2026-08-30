---
schema: pipeline.backlog-item.v1
id: pipeline.tp-ceremony-denials-inline-a-150-line-multi-shell-block-by-default
type: workflow-improvement
owner: pipeline
status: closed
closed_at: 2026-08-30
closure_repository: self
closure_commit: 2d8c2990960ac2182fa6f9c0ba59e8077971e3a3
closure_evidence: plugins/pipeline-core/scripts/guard-human-override.test.mjs
created: 2026-08-30
sprint: nova
tracking: "NOW / Nova A -- PO decision 2026-08-30, item #12 of a 12-point instruction list: implement the Elephant's own guard-verbosity-slimming proposal."
source: "PO live session 2026-08-30, raised while diagnosing why context returns to ~200k tokens immediately after every /compact: every TP-protected-file guard denial (hooks.json, verify.mjs, 5x pipeline-state.test.mjs today alone) dumped a ~150-line block with 4x redundant posix/powershell/cmd.exe copy-safe renderings for every ceremony step."
---

# TP-ceremony guard denials inline a ~150-line multi-shell copy-safe block by default, every time

## What happened

`guard-testpath.mjs` and `guard-lifecycle-ready.mjs` both called a
`boundedCeremonyRenderingBlock()` helper that inlined, for EVERY ceremony
step (plan, prepare-authorization, emit-signature-digest,
authorize-by-signature, or the chat equivalents), a full posix/powershell/
cmd.exe wrapped-line rendering -- even though the flat single-line command
(already always printed first) almost never actually needs it for an agent
session (no terminal-width wrapping problem when reading structured text).
Measured live in this session: this block was the dominant driver of the
"context back to ~200k tokens right after every /compact" complaint, with
roughly 10 TP-guard denials in one session day.

## Proposal (PO-approved)

Move the redundant multi-shell renderings out of the default inline denial
text, onto an on-demand path, while keeping the flat single-line command
chain and the TP-rule rationale prose completely unchanged -- the actual
safety property (a human whose terminal wraps a copied line can still get a
shell-correct rendering) must stay genuinely reachable, just not dumped
inline every time.

## Closed, 2026-08-30 (NVA-CF-GUARDVERBOSITY)

New `guard-human-override.mjs render-copy-safe --repo <root> --request-sha256 <sha>`
subcommand reproduces the identical bounded posix/powershell/cmd.exe
rendering for a real recorded ceremony request, on demand. Both hooks
(`guard-testpath.mjs`, `guard-lifecycle-ready.mjs`) now print a 2-line
pointer to it instead of the full inline block; the flat single-line
ceremony command chain and all TP-rule rationale prose are byte-identical
to before. Measured real before/after on one live denial: 96 -> 17 lines
(82.3% reduction). Regression coverage: `render-copy-safe` proven
byte-identical to the old inline rendering via the shared
`copy-safe-command.mjs` renderer; existing tests that asserted the old
inline behavior were updated to assert the new default + on-demand
reproduction, not deleted.

Independently re-verified by the Elephant, all 5 suites green:
`human-guard-override.test.mjs` 97/97, `guard-human-override.test.mjs`
21/21, `guard-testpath.test.mjs` 14/14, `guard-lifecycle-ready.test.mjs`
183/183, `check-consumer-safe-paths.test.mjs` 9/9. Commits `9e8091ec`
(mechanism) + `2d8c2990` (hooks + tests).

## Triage

- **Decision:** accepted, Nova A, PO-approved 2026-08-30 as item #12 of a
  12-point instruction list
- **Rationale:** direct, measured driver of a real session-usability
  complaint; safety property preserved, only default disclosure changed
- **Date:** 2026-08-30
