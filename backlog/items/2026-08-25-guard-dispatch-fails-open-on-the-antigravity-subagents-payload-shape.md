---
schema: pipeline.backlog-item.v1
id: pipeline.guard-dispatch-fails-open-on-the-antigravity-subagents-payload-shape
type: defect
owner: pipeline
status: closed
closed_at: 2026-08-25
closure_repository: self
closure_commit: 12a39b46bfa0628596546cfdb0703f0e903a0c7a
closure_evidence: backlog/items/2026-08-25-guard-dispatch-fails-open-on-the-antigravity-subagents-payload-shape.md
created: 2026-08-25
source: "PO relay (chat), 2026-08-25, from a separate Agy greenfield-test session's own live-reproduced dispatch-guard bypass test (transcript pasted verbatim by the PO); confirmed independently this session by direct reading of plugins/pipeline-core/hooks/guard-dispatch.mjs lines 83-99"
---

# `guard-dispatch.mjs` fails OPEN (admits unconditionally) on the Antigravity runner's native `invoke_subagent` payload shape

## Description

`guard-dispatch.mjs` exists to block a Critic/Goldfish subagent dispatch that
was not built from the required template (prose instead of paths, granted
write tools on a Critic, etc.). It recognizes exactly two payload shapes:

1. A direct Agent-tool call: `toolInput.subagent_type`/`toolInput.subagentType`
   plus `toolInput.prompt` (lines 86-87, 90-91).
2. A Workflow-tool call: `toolInput.script` containing a statically-resolvable
   `agentType`/`prompt` pair (lines 92-96, `extractWorkflowDispatches()`).

If NEITHER shape matches, line 98 is `process.exit(0)` — unconditional
admission, no validation performed at all.

The Antigravity runner's own native `invoke_subagent` tool call does not use
either shape. Its actual payload is `{ "Subagents": [{ "TypeName": "critic",
"Prompt": "..." }] }` (capitalized keys, array-wrapped, `TypeName` not
`subagent_type`/`subagentType`, `Prompt` not `prompt`). Reading the guard's
own extraction logic (`toolInput.subagent_type ?? toolInput.subagentType ??
""`) against this shape: `subagentType` resolves to `""` (neither key
exists), so the first branch (line 90) is false; `toolInput.script` also
does not exist in this shape, so the second branch (line 92) is false; the
guard falls through to line 98 and exits 0 unconditionally, admitting the
dispatch with zero checks.

## Reproduction (from the source session, not independently re-run here, but consistent with the code read above)

The source session live-dispatched a `critic` subagent via `invoke_subagent`
with a prose prompt ("please review this code. I think the bug is in line
42 because I changed the array map.") instead of the mandatory
paths-only construction from `templates/prompts/critic-review.md`
(`roles/critic.md` §46/§103's own contamination-prevention contract, and the
exact failure class CLAUDE.md's "Dispatch from the template, never freehand"
rule exists to catch). The dispatch was admitted; the guard produced no
denial. The subagent itself started and began investigating the
(nonexistent) prose-described bug, confirming the contamination-prevention
contract was fully bypassed for this payload shape.

## Distinguishing this from the ALREADY-KNOWN Workflow-tool gap

The source session also reproduced three ways to defeat the `script`-string
regex extraction for a Codex/Workflow-tool dispatch (a template-literal
`${...}` in the prompt, a prompt passed via a variable reference instead of
a literal, and `"agentType"` written as a quoted key). **This part is NOT a
new finding** — `extractWorkflowDispatches()`'s own header comment
(`guard-dispatch.mjs` lines 30-41) documents this exact fail-open posture as
DELIBERATE ("a false positive on a script that never dispatches a
Goldfish/Critic role is worse than a miss"), and it is already tracked in
`backlog/items/2026-08-18-guard-dispatch-has-no-workflow-tool-awareness.md`
(closed — the item that shipped `extractWorkflowDispatches()` in the first
place, consciously scoped to the statically-obvious case only). No new item
needed for that half; recorded here only to avoid this item being read as
covering it too.

**What IS new:** the Antigravity `Subagents`/`TypeName`/`Prompt` shape is a
THIRD payload shape this guard has never recognized at all — not
mentioned anywhere in the existing header comment's two-shape enumeration,
and not a deliberate scoping decision the way the Workflow-tool gap is. This
is a genuine blind spot, not a documented tradeoff.

## Impact

Any Antigravity-runner session (this repository is actively run under
Antigravity — "agy" — per this session's own branch/task naming) can dispatch
a Critic or Goldfish subagent with an arbitrary freehand prompt, bypassing:
the template-construction requirement, the write-tools-on-Critic block, and
every other check `guard-dispatch.mjs` exists to perform — with the guard
producing no denial and no audit signal that anything was skipped. The
source session's own follow-up note is accurate: the subagent's own
downstream tool-call permissions (a Critic's read-only role) still applied
via a separate mechanism, so this is a contamination/process-integrity
bypass, not a direct sandbox escape — but contamination of Critic/Goldfish
findings is exactly the failure class the template-construction rule and
`roles/critic.md` §46/§103 exist to prevent.

## Proposal

Extend `guard-dispatch.mjs` to recognize the Antigravity `Subagents` array
shape as a third case alongside the existing two (direct Agent-tool,
Workflow-tool `script`): iterate `toolInput.Subagents`, extracting
`TypeName`/`Prompt` per entry, and apply the same validation already applied
to the other two shapes. Add a regression test mirroring the existing
`guard-dispatch.test.mjs` coverage for the other two shapes, using a fixture
built from the ACTUAL Antigravity payload shape (capitalization included) —
per this repository's own "fixture-blindness" lesson
(`templates/prompts/goldfish-task.md`'s DoD note on testing only the
convenient form), not a paraphrased/relative-only version of it.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:** deferred
- **Rationale:** confirmed real via direct code reading (not just trusting
  the relayed transcript), but this session already has three concurrent
  implementation dispatches in flight on a different subsystem (chat-gate
  ceremony standardization); a guard-dispatch.mjs fix needs its own
  properly-scoped dispatch with `guard-dispatch.test.mjs` explicitly granted,
  not folded into unrelated work.
- **Assignment (if accepted):** next available slot — this is Nova-scope
  work (a live gap in the currently-used Antigravity runner), not deferred
  to Nova B like the sibling theoretical item
  [[agent-binding-guards-are-not-os-level-sandboxing]].
- **Date:** 2026-08-25

### Triage update (Goldfish dispatch AGY-SWEEP-guard-dispatch-fail-open, 2026-08-25)

- **Decision:** implemented. Revisited per explicit PO instruction to work
  through deferred items now rather than leaving the earlier deferral
  standing.
- **What changed:** `plugins/pipeline-core/hooks/guard-dispatch.mjs` gained
  `extractAntigravityDispatches()`, a third recognized payload shape
  alongside the direct Agent-tool (`subagent_type`/`prompt`) and
  Workflow-tool (`script`) shapes already handled: `toolInput.Subagents` is
  read as an array of `{ TypeName, Prompt }` entries (capitalized keys,
  matching the actual reported Antigravity shape) and each entry is run
  through the same `dispatchFindings()` check the other two shapes already
  use. A malformed entry (no string `TypeName`) is skipped rather than
  guessed at, preserving the file's existing fail-open posture on anything
  it cannot confidently read. The header comment gained a matching
  "ANTIGRAVITY RUNNER AWARENESS" paragraph.
- **Tests:** `plugins/pipeline-core/hooks/guard-dispatch.test.mjs` gained
  GD12-GD15, built from the actual reported payload shape (capitalization
  included, not a paraphrased stand-in): GD12 blocks a Subagents-array
  Critic dispatch carrying a claims list, GD13 allows a clean
  references-only one, GD14 blocks the exact freehand-prose Critic dispatch
  the source session reproduced, GD15 allows an unrelated subagent type.
  `node --test plugins/pipeline-core/hooks/guard-dispatch.test.mjs`: 15/15
  pass, exit 0. `node --test
  harness/scripts/check-consumer-safe-paths.test.mjs` (required, touched
  `plugins/pipeline-core/`): 9/9 pass, exit 0.
- **Not touched:** `NEVER_LIFTABLE_KERNEL_PATHS` in
  `guard-maintenance-window.mjs` does not list `guard-dispatch.mjs` or
  `dispatch-policy.mjs`, and this change adds no new import edge into any
  listed file, so the kernel-closure test was out of scope per this
  dispatch's own briefing and was not run.
- **Commit:** `ced361b1b5c9f707472c20e361f5380a744c1adc`.
- **`status:` field:** left untouched — the Elephant reconciles it centrally
  across the sweep.

### Closure, 2026-08-25

Closed by the Elephant. Independently re-verified
(`node plugins/pipeline-core/hooks/guard-dispatch.test.mjs`, 15/15,
including the reproduced source-session bypass GD14) on `sprint_agy` HEAD
after cherry-picking `ced361b1` in as `12a39b46bfa0628596546cfdb0703f0e903a0c7a`.
