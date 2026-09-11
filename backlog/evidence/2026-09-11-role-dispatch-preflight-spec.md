---
schema: pipeline.backlog-item.v1
id: pipeline.role-dispatch-payload-errors-fail-before-model-launch
type: defect
owner: pipeline
status: open
created: 2026-09-10
sprint: nova-b
done_when: manual
source: "PO observation during 0.6.2 candidate review: malformed or incomplete role dispatches repeatedly consumed roughly ten minutes before reporting a coordinator/payload failure. The requirement applies to every role, not only Critic."
---

# Role dispatch payload errors fail before model launch

## Problem

Advisor, Critic, Goldfish, Elephant and other configured roles can reach an
expensive launcher before the dispatch packet has been proven usable. Missing
fields, wrong paths, stale candidate bindings or an invalid role contract may
therefore surface only after a model timeout. Repeating the launch multiplies
the delay and obscures the actual coordinator defect.

## Required behavior

- One shared, runner-neutral preflight validates the complete dispatch packet,
  role identity, required paths, candidate binding and result destination
  before any model, App Server, PTY or external launcher starts.
- Claude Code, Codex and Antigravity adapters consume the same verdict. Every
  supported role is covered; Critic-specific validation is only an extension
  of the common contract.
- Invalid input returns a bounded structured diagnostic naming the failing
  field and exits before model launch. The normal local target is under five
  seconds.
- Tests prove that each invalid fixture makes zero launcher/model calls and
  that a valid fixture reaches its intended role unchanged.
- Batch execution reports `PREPARE` success or failure for every packet before
  printing the first `START`, so one bad packet cannot waste a long-running
  review slot.

## Implementation progress — 2026-09-11

The first shared preflight slice is implemented for the native tool envelopes
that can otherwise fail after launch:

- `dispatch-policy.mjs` owns the shipped role registry and common packet
  findings instead of duplicating them in runner adapters;
- Claude Code direct `Task`/`Agent`, static Workflow calls, Antigravity
  `Subagents` envelopes and Codex `spawn_agent` consume that verdict;
- missing role/prompt fields, unknown namespaced pipeline roles and missing
  Workflow plugin prefixes return a structured
  `pipeline.role-dispatch-preflight.v1` rejection with `modelCalls: 0`;
- Codex keeps its optional native `agent_type` contract: omission selects its
  valid `default` role, while a missing message is rejected;
- unrelated host-defined roles remain admissible because the pipeline has no
  registry authority over them.

Focused process tests cover all shipped roles and all three runner adapters.
This closes the malformed native-envelope path without changing the launcher
architecture.

The item remains open. A later slice still has to define and enforce the common
coordinator envelope for required paths, candidate commit/tree binding and
result destination, and batch coordinators still need an all-packets `PREPARE`
barrier before their first `START`.

The second shared slice closes a correction-review dispatch ambiguity found
during Nova B itself. Critic preflight now emits an explicit
`dispatch.reviewerInput` containing only the frozen refs and current source,
guardrail and evidence paths. A prior Critic report is retained separately as
`coordinatorOnly.priorCriticEvidence`; the review skill forbids copying that
path or its bytes into a fresh Critic input. This aligns the executable handoff
with QG-13 and prevents a valid correction from spending a review run only to
discover that its dispatch was contaminated by the previous verdict.

The third shared slice introduces the runner-neutral coordinator envelope in
`role-dispatch-preflight.mjs`. Before a launcher can be called it binds the
role and transport to the existing shared dispatch policy, resolves the exact
candidate commit and tree, proves every required source path is a regular file
in that candidate, and rejects an absent, existing, escaping or symlinked
result destination. Rejections name the failed field and report zero model and
launcher calls.

Its batch API prepares every packet before it invokes the first supplied
launcher. The registered dispatch-policy suite covers all eight shipped roles:
one invalid required path in each packet rejects the batch with zero launches,
while a completely valid batch reaches the launcher with each role envelope
unchanged. The invalid batch also asserts the required local five-second
bound. This is the reusable coordinator contract; individual runner adapters
retain their earlier native-envelope hook and consume the same role-policy
verdict. Actual coordinators must call the batch API rather than recreate its
barrier locally before this item can close.

**Owner and due date:** Pipeline team, due 2026-09-30. The reusable envelope
and all-packets barrier now exist, but the item remains open until the shipped
model-launching coordinators call them and adapter-level tests prove that each
configured runner stops before its launch boundary.

**Rollback:** revert the implementation commit that wires the shared packet
verdict into the runner manifests, regenerate `docs/enforcement.md`, and move
the capability inventory baseline back to the resulting commit. This restores
the prior runner behavior without leaving a documented hook surface that no
longer exists. A rollback must rerun the dispatch-policy, runner-hook,
capability-inventory and documentation-contract checks before restamping.

## Greenfield 0.6.2 evidence — 2026-09-11

The Claude greenfield analysis records a malformed Critic packet that reached
the expensive path, produced zero model turns, ran for 30 seconds and consumed
50,629 tokens. A separate Nova candidate-review batch also rejected incomplete
verdict/assurance fields at packet preparation once the normal session Critic
route was restored. Long successful model reviews are not evidence for this
defect; the target is specifically invalid input reaching any launcher.

This sharpens the acceptance test without changing the planned sprint: every
role/runner fixture with an invalid required field must terminate during
`PREPARE`, within the local five-second bound, and prove zero launcher calls.
See `backlog/evidence/2026-09-11-greenfield-062-three-runner-findings.md`.

### Critic reviewer-input correction, 2026-09-11

A live correction review exposed a remaining pre-launch mismatch:
`critic-dispatch-preflight.mjs` returned `packet-ready` with every expanded
governance file, but its `reviewerInput` omitted the manifest's two resolved
governance directory paths and the fixed ruleset SHA required by the strict
Critic bootstrap. The Critic therefore rejected the packet only after launch.

The preflight result must carry both resolved governance directories and bind
`rulesetSha` to its already frozen candidate commit. Tests must assert these
fields alongside the expanded candidate-file guardrails. The route caller may
still add `project`, `verdict` and `assurance` metadata, but it must not
reconstruct the preflight-owned refs or paths.

<!-- SPEC-REFERENCE-STRIPPED-TRIAGE: this section of the original backlog item has been removed for dispatch citation. It recorded a prior human or Critic verdict about this item -- never spec/reference content -- and would otherwise contaminate an independent downstream review or implementation. See the item's own file for the full history. Convention: backlog/items/2026-08-18-triage-verdict-text-can-contaminate-a-backlog-item-as-a-later-spec-reference.md. -->
