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

The initial Critic found one Git pathspec ambiguity in `requiredPaths`:
`:README.md` could select a real `README.md` while not naming that file. The
correction uses Git's literal-pathspec mode and adds the exact zero-launch
regression. Exact Verify passed 520/520 and the focused correction Critic
returned PASS with no findings; see
`backlog/evidence/2026-09-11-role-dispatch-preflight-critic-pass.md`.

The fourth slice fixes the handoff from Critic preflight to the ordinary
session Critic. A live correction review showed that `packet-ready` expanded
every governance file but omitted the two manifest-declared governance
directories and the fixed ruleset SHA from `dispatch.reviewerInput`. The
strict Critic therefore rejected the otherwise valid dispatch after launch.

`reviewerInput` now supplies those preflight-owned fields directly and covers
both governed and no-governance manifests. The protected Critic skill names
the same ownership boundary. Exact Verify passed 520/520 and an independent
Critic returned PASS with no findings. The item remains open for its stated
final condition: every shipped model-launching coordinator must consume the
common batch preflight before its first launch.

The fifth slice wires the common contract into the real Advisory host bridge
for Claude Code, Codex and Antigravity. The bridge validates the complete
evidence bundle, candidate commit/tree, physical repository root and
coordinator-owned result directory before it can obtain an adapter or enter
the selected Codex sandbox route. Every required path now carries the SHA-256
of the bytes that will actually be transported; the preflight compares that
digest directly with the immutable candidate blob and separately rejects a
dirty physical path. This closes both stale-bundle and check/use replacement
windows.

Bridge-level tests prove zero adapter calls for untracked or modified inputs,
candidate-foreign transported bytes, evidence digest/reference drift and a
symlinked receipt directory. A valid Codex fixture proves the launch receives
the exact physical root admitted by preflight. Fresh Verify passed 520/520
with reuse disabled on the final correction and the independent Critic
returned PASS with no findings; see
`backlog/evidence/2026-09-11-advisory-dispatch-preflight-critic-pass.md`.

The sixth slice wires the same coordinator contract into the direct Claude
Critic host before its bounded native probe or real review can start. The
late launch recheck reconstructs its packet from the durable authorization,
so mutation of the earlier preparation view cannot redirect the result or
weaken candidate and source bindings. The focused host suite passes 16/16;
an independent correction Critic returned PASS with no findings. See
`backlog/evidence/2026-09-11-claude-critic-dispatch-preflight-pass.md`.

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

The seventh slice in `2ea74dba` makes the shared result contract usable by the
remaining native coordinators before wiring them. Existing `resultPath`
packets retain their file semantics; explicit destinations now distinguish a
validated file from a truthful `return` or `stream` result, so a native return
does not invent a path. Batch preparation propagates an external result root
and checks legacy and explicit file paths in one collision namespace.

The first review found a time-of-check/time-of-launch race for later packets.
The correction preserves the all-packets PREPARE barrier and re-runs the full
packet preflight immediately before each individual launcher. An occupied
result, replaced symlink parent or changed required input blocks that later
launcher as `RDB-PREPARATION-STALE`. The affected launcher is never called.
Malformed destinations use a real launcher spy and prove zero calls.

The suite passed 31/31 and an independent correction review returned PASS.
It also migrated directly to required case-completion evidence as DPT01 through
DPT31; the exact candidate-bound registry check passes. See
`backlog/evidence/2026-09-11-dispatch-destination-preflight-pass.md`.

The item remains open for coordinator wiring. The disabled native Codex worker
supervisor is outside Nova B and moves with the dedicated native-Windows Codex
sandbox package. Antigravity still requires a real production caller before an
adapter-level completion claim is possible; no placeholder launcher will be
invented merely to close this item.

The eighth slice in `85921a11` wires both shipped Codex Critic coordinators.
The native host passes candidate blobs through the shared role-dispatch
preflight and separately binds its coordinator evidence to the same commit and
tree. The selected host prepares its packet before either App Server or CLI
execution, then re-resolves the V3 route and repeats the complete preflight at
the immediate launch boundary. Oversized reference sets fail before hashing;
stale sources, route drift, symlinked destinations and forged preflight error
lookalikes cannot reach the launcher.

The native host suite passes 8/8 and the selected host suite passes 133/133 at
the real WSL host boundary. The generic read-only bridge suite passes 10/10.
Separate independent correction reviews returned PASS with no findings for
both coordinators. Their normal Verify registrations now require exact
case-completion evidence. These focused WSL results validate the platform-neutral
packet contract only; they are not native Codex sandbox acceptance evidence.
The item remains open in Nova B only for a real Antigravity production caller
that can consume the common contract without inventing a launch surface. The
disabled local Codex worker supervisor is assigned to the future native-Windows
package and does not block this item or Nova B.

## Scope correction — 2026-09-11

The PO explicitly deferred all native Codex sandbox, App Server and Selected
lane acceptance work under WSL. Native Codex sandbox behavior is technically
unreliable in that environment and will be investigated later on native
Windows. Nova B therefore retains only the runner-neutral preflight contract,
ordinary fresh-session Critic path and real non-native adapter integration.
No WSL result may be promoted into a native-sandbox readiness claim.

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

## Triage — 2026-09-11

- **Decision:** accepted for Nova B; no additional 0.6.2 release blocker was
  established after the bounded harness timeouts and normal session-Critic
  route were restored.
- **Priority:** first cost-reduction implementation in Nova B. The measured
  malformed packet spent 30 seconds and 50,629 tokens without a model turn;
  the shared preflight prevents the same class across every role and runner.
- **Boundary:** do not implement this as five adapter-local validators. The
  common verdict and zero-launch tests land first; runner and role extensions
  consume that result.
