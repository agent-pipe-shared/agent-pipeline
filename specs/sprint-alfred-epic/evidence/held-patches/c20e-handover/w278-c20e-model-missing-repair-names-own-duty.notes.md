# w278: a dispatch without a model is told its own agent type's duty selector (candidate 20e, G20-70, AC-108)

Built by the Elephant (PO exception: small items in the Elephant) in the slice clone `scratch/agent-out/c20e` on top of the
candidate 20d chain (`ed00cb2de`, identical content to the applied 20d). Two clone commits, one patch. Closest criterion:
AC-108; PRD and Spec unchanged.

## Why

Measured in the Claude greenfield TabletApp_claude_070_3 (2026-11-08): a Critic dispatch (`pipeline-core:critic`, no
model) was refused DISPATCH-MODEL-MISSING with a repair that named the implementation duty (`duty.implement = "sonnet"`),
so the coordinator dispatched the Critic with the implement model and met the next refusal.

## What the patch changes

`plugins/pipeline-core/lib/dispatch-model-enforcement.mjs`, the DISPATCH-MODEL-MISSING branch: the repair names the duty
routes of the dispatched agent type itself (`AGENT_TYPE_DUTIES`), for example `pipeline-core:critic serves
duty.critic_normal = "..."`; for an Opus Critic route it also names the MP-07 lines (`Batch scope (MP-07):` and the
critical architecture/security rationale) that DISPATCH-OPUS-NO-BATCH-RATIONALE otherwise refuses. An agent type without
duty routes keeps the implementation default hint. The later route computation reuses the same `ownRoutes`.
Test: new case DME02b in `dispatch-model-enforcement.test.mjs` (critic, mechanic and generic hints; the MP-07 hint only
for an Opus route).

## Evidence (clone, one suite at a time, private TMPDIR)

`lib/dispatch-model-enforcement.test.mjs` 14/14, `hooks/guard-dispatch-model.test.mjs` 5/5,
`hooks/antigravity-pretool-guard.test.mjs` green.

## Not changed

The admission rule itself (a dispatch without a model is still refused), the routes, the Critic preimage files.

## Not proven

A live coordinator reading the new repair (next greenfield). With the G20-71 decision (opus stays, the preflight writes
the MP-07 lines, package w277) the MP-07 hint here becomes the fallback for a hand-built Critic dispatch.
