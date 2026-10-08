---
schema: pipeline.backlog-item.v1
id: pipeline.push-classifier-deny-list-does-not-converge
type: defect
owner: pipeline
status: open
created: 2026-10-06
source: "GPGL-8 Opus Critic round, 2026-10-06 (specs/sprint-alfred-epic/evidence/critic-2026-10-05/gpgl-8.md), fifth consecutive round with new bypasses."
sprint: alfred
done_when: manual
---

# The push classifier's deny-list of hidden-push shapes does not converge

## Description

`commandIsGitPush` in `plugins/pipeline-core/lib/git-cmd.mjs` decides whether a shell text reaches the push gate
(`guard-push` on the Claude Bash/PowerShell route; the Codex pretool route relies on it alone). Each fix round has added
detection for the shapes the previous Critic traced, and each following round found new ones. After GPGL-8
(`7b0bb402a`) the Critic traced, statically: check #5 bypassed by an escaped command terminator or escaped backtick
(F1); bare parameter expansion, bash locale quoting `$"…"` and PowerShell grouping `("push")` evading the expansion
check (F2); a substitution inside an unquoted here-document body treated as data (F3); the loosening branches of the
new checks untested (F4, QG-11); open-gap notes stale and undated (F5).

## Triggering situation

GPGL-5/6/7/8 Critic records in `specs/sprint-alfred-epic/evidence/critic-2026-10-05/`
(`gpgl-5-6-delta.md`, `gpgl-7-fix-verification.md`, `gpgl-8.md`).

## Affected artifact

`plugins/pipeline-core/lib/git-cmd.mjs`, `plugins/pipeline-core/lib/git-cmd.test.mjs`; consumers
`plugins/pipeline-core/hooks/guard-push.mjs`, `plugins/pipeline-core/hooks/codex-pretool-guard.mjs`.

## Proposal

PO question Q12 (`specs/sprint-alfred-epic/plans/0.7-execution-order.md`): invert to an allowlist of plain commands —
any text with a git word at an executable boundary that also contains `$`, a backtick, a backslash, `<<`, parentheses
or a non-ASCII quote character is a push candidate routed to guard-push (which refuses every non-exact push form) — and
delete the shape-specific checks. Pin the Critic's traced shapes as RED tests first (test-only dispatch). Supersedes
the narrower items `2026-10-06-push-classifier-does-not-model-powershell-backtick-escapes.md` and
`2026-10-06-push-classifier-misses-nested-quotes-and-redirect-before-push.md` if (B) is chosen. Due before the 0.7.0
release candidate.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:** fixed in source — closes after the 0.7.0 candidate host checklist (status stays `open` until then).
- **Rationale:** commit(s) `d9b4bf031, 49d6f928d`.
- **Assignment (if accepted):** sprint-alfred-epic close-out batch.
- **Date:** 2026-10-08.
