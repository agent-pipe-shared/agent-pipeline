---
schema: pipeline.backlog-item.v1
id: pipeline.push-approval-signature-commands-also-line-wrap
type: defect
owner: pipeline
status: closed
created: 2026-08-10
closed_at: 2026-08-11
closure_repository: self
closure_commit: 28818f162168b818a1cb48c4a099658e22950bd4
closure_evidence: specs/sprint-nova-epic/evidence/backlog/2026-08-11-pareto-triage-report.md
source: "PO live observation, 2026-08-10: 'auch die signatur aufforderungen für push kommen weiter mit zeilenumbrüchen das macht keinen spass in der ux' — reported while GF-094 (a same-class fix for the codex-pretool-guard.mjs attended-host-terminal path) was still in flight."
---

# The push-approval signature ceremony command also reaches the human with unsafe line-wraps, same root cause class as the kickoff plan/apply bug GF-094 fixes

## Description

`plugins/pipeline-core/skills/pipeline-start/references/push-approval.md`
documents the human's one ceremony command
(`po-human-approval.mjs authorize-critical --repo-root <repo> --directory
<external-po-dir> --feature-id <featureId> --plan <path> --spec <path> --kind
push --subject-sha256 <hash> --expires-at <ISO-8601>`) with the explicit note
"The agent constructs the command (including `--subject-sha256`) and hands it
over." Unlike the restart-process path (`restartCopyCommands` in
`lib/project-onboarding-v3.mjs`), there is no structured `copyCommand`-shaped
field here at all — the agent has to fill in the placeholders (absolute repo
path, external key directory, feature id, PRD/spec paths, a 64-hex-char
digest, an ISO-8601 timestamp) and render the whole thing itself, using
whatever prose/code-block formatting it chooses. The reference's own worked
example (lines 104-110) is a POSIX-only backslash-continuation rendering with
no bounded width and no PowerShell/cmd variant — an agent copying that
pattern with real (long) values has nothing that guarantees a safe,
copy-paste-stable result, and the PO reports it does not currently produce
one in practice.

This is the same root-cause class already confirmed and being fixed under
GF-094 (2026-08-10, same session): a long, multi-flag, hash-bearing command
reaching a human for manual execution with no bounded/safe rendering,
relying instead on the constructing agent to get formatting right ad hoc.

## Triggering situation

PO live observation, 2026-08-10, reported immediately after GF-093 (guard
`--help` fix) landed and while GF-094 was still running in the background.
Not tied to either of today's two live greenfield tests (those never reach a
push/release ceremony) — this is a standing complaint from broader
experience with the push-approval flow.

## Affected artifact

`plugins/pipeline-core/skills/pipeline-start/references/push-approval.md`,
the "The human's one command (current shape)" section (currently lines
102-127) and its worked example. Possibly also wherever an agent actually
composes this text at ceremony time (no dedicated script/JSON output owns
this rendering today — confirmed by reading the reference itself, which
states the agent constructs it inline). Likely shares its fix technique with
whatever generic bounded-copy-command renderer GF-094 produces for an
arbitrary already-assembled command string (see GF-094's dispatch record and
final report once landed) — check there first before designing a second,
divergent mechanism.

## Proposal

No fix designed yet — deliberately sequenced after GF-094 lands, so this can
reuse its actual exported helper/technique rather than inventing a parallel
one. Direction: once GF-094's generic bounded-rendering primitive exists,
either (a) have `po-human-approval.mjs`/`po-approval-gate.mjs` itself emit a
`copyCommand`-shaped field for the filled-in `authorize-critical` invocation
(mirroring `restartCopyCommands`, generalized to arbitrary flag/value pairs
rather than one fixed shape), which the agent then relays verbatim per the
existing SKILL.md rule — the more robust option, since it removes the
agent's own formatting from the trust boundary entirely; or (b), if a code
change is judged out of proportion for a ceremony command that is typed once
per release, strengthen `push-approval.md` with explicit bounded-rendering
instructions (posix/powershell/cmd variants, hard column width, single-quoted
value chunks) that the agent must apply when filling in placeholders, mirror
of what SKILL.md already requires for `launch.copyCommand`.

## Triage (filled in by the Elephant of the next Pipeline session)
