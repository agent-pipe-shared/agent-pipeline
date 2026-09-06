---
schema: pipeline.backlog-item.v1
id: pipeline.the-t1-fallback-waits-for-failure-codes-the-route-collapses
type: defect
owner: pipeline
status: open
created: 2026-09-06
source: "NVA-B-T1WIRE-1 orientation findings, verified independently by the dispatcher: codex-sandbox-select.mjs:240 preflightFailure() and codex-critic-selected-host.mjs:236 runSelectedCriticHost(). The dispatch delivered the CLI (b3b7cb7e) and stopped before the consumer rather than wiring a path that cannot fire."
sprint: nova-b
done_when: manual
---

# The T1 fallback waits for failure codes the route collapses before they arrive

## Description

`critic-t1-po-override.mjs` decides whether a PO-authorized single-attempt
fallback from the isolated Codex T1 lane may run. It now has a command-line
entry point (`b3b7cb7e`) so an authorization can be produced. It still has no
consumer, and an attempt to add one uncovered why adding one naively would
produce a second dead mechanism rather than a working fallback.

Two facts, both verified directly in the source:

**The granular failure code never reaches the caller.**
`decideT1Fallback` admits a fallback only for a code in
`ALLOWED_PRE_VERDICT_CODES`: `binary-missing`, `child-stdio-error`,
`permission-denial`, `sandbox-setup-error`, `unsupported-profile`. But
`codex-sandbox-select.mjs`'s `preflightFailure()` (line 240) maps every
preflight outcome to exactly two values — `host-mode-unavailable` for two
specific terminal codes, and the generic `preflight-failed` for everything
else, `child-stdio-error` included. The `failureClass` a caller sees can
therefore never match the list the decision function requires. The granular
code survives only inside `selection.preflight.terminalCode`, which reaching
means new plumbing through the selection store.

**The briefed composition point is not the live route.**
`runCodexCriticThroughSelectedSandbox()` in `codex-critic-host.mjs` looks like
the place a consumer belongs, and it is bypassed:
`codex-critic-selected-host.mjs`'s `runSelectedCriticHost()` (line 236) calls
`executeSandboxedReadonlyDuty` directly and is the only production consumer of
that seam.

## Why this is the same shape as two other defects filed today

This is the third mechanism measured on 2026-09-06 that is complete, tested,
and waiting on a value that never arrives:

- `guard-dispatch-budget.mjs` discriminates a subagent by a transcript-path
  shape no payload carries, so its counter never moves.
- `guard-slicing.mjs` is fully built and tested and no hook manifest invokes
  it.
- this one, waiting for failure codes the route collapses one layer above it.

The reachability audit
(`backlog/evidence/2026-09-06-built-but-unwired-audit.md`) found the same
shape structurally: code, tests and a declaration built ahead of the wiring
that would let anything call it. What this item adds is a nastier variant —
here the wiring could be added and the mechanism would STILL not fire, because
the mismatch is in the data flowing through it, not in the absence of a call.
A reachability graph cannot see that; only reading the two ends against each
other can.

## Affected artifact

- `plugins/pipeline-core/scripts/codex-sandbox-select.mjs` — `preflightFailure()`
  at line 240, the collapse point.
- `plugins/pipeline-core/scripts/codex-critic-selected-host.mjs` —
  `runSelectedCriticHost()` at line 236, the live route.
- `plugins/pipeline-core/scripts/critic-t1-po-override.mjs` —
  `ALLOWED_PRE_VERDICT_CODES` and `decideT1Fallback`, unchanged and correct;
  the mismatch is not theirs to fix unilaterally.
- `plugins/pipeline-core/scripts/codex-critic-host.mjs` —
  `runCodexCriticThroughSelectedSandbox()`, which is not the live route and
  should probably say so.

## Proposal

Decide one thing first, because everything else follows from it: should the
granular preflight terminal code reach the caller, or should the fallback
decide on the collapsed class?

Carrying the granular code through is the more honest option — the fallback's
whole point is that only certain pre-verdict failures may be retried in a
weaker lane, and `preflight-failed` erases exactly that distinction. It is
also the more invasive one, since `preflightFailure()`'s two-value output is
presumably load-bearing for the selection record's own schema. The alternative
is to have the consumer read `selection.preflight.terminalCode` from the
persisted selection rather than from the failure class, which leaves the
collapse alone.

Whichever is chosen, the consumer belongs at `runSelectedCriticHost()`, not at
the seam that looked right from the outside.

**This is a fallback into a weaker assurance class, so it stays a PO
decision** — the same reason the authorization exists at all. Nothing here
should be wired on an agent's judgment.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:**
- **Rationale:**
- **Assignment (if accepted):**
- **Date:**
