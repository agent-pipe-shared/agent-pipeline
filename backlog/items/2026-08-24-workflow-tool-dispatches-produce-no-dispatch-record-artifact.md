---
schema: pipeline.backlog-item.v1
id: pipeline.workflow-tool-dispatches-produce-no-dispatch-record-artifact
type: defect
owner: pipeline
status: open
created: 2026-08-24
sprint: nova-b
tracking: "Reassigned from phoenix to nova on 2026-08-28 by PO decision, after the Phoenix line was intaked into Nova"
source: "Third delta Critic review of sprint-agy-runner, finding F3 (specs/sprint-agy-runner/evidence/2026-08-24-delta3-critic-review-agy-runner.md); PO-accepted disposition 2026-08-24"
due: 2026-08-31
done_when: manual
---

# Workflow-tool dispatches produce no `evidence/dispatch-record-<TASK_ID>.json` artifact

## Description

Five commits in the `sprint-agy-runner` AGY-FIX2 correction wave (`30e0adcc`,
`06483053`, `42196d50`, `1b55b98c`, `c15ccdff`) carry a `Dispatch: <ID>
(goldfish)` trailer for a goldfish task that genuinely ran through the
Workflow tool, but `evidence/` contains no
`dispatch-record-<TASK_ID>.json` for any of them — while the prior wave's
`agent()`-via-Agent-tool dispatches (`AGY-FIX-PUSHGUARD`, `AGY-FIX-HARDENING`,
etc.) do have their standard dispatch-record artifacts, ruling out pruning as
the explanation. `dispatch-authorship-verify.mjs` therefore cannot confirm
these five commits' authorship claim mechanically; they are `UNVERIFIABLE`
by the machine check, not `PASS`.

Root cause (not yet confirmed by reading the Workflow tool's dispatch path):
the Workflow tool's `agent()` primitive does not write the standard
`evidence/dispatch-record-<TASK_ID>.json` artifact that a template-built
Agent-tool dispatch does — a gap in the Workflow-tool integration, not
fabricated authorship on the commits themselves (accepted PO disposition,
`specs/sprint-agy-runner/evidence/2026-08-24-delta3-critic-review-agy-runner.md`
"PO disposition, 2026-08-24 (round 3, F3/F4/F5)").

## Why this matters

`agent-obligations.md` §6 makes the goldfish dispatch trailer a checkable
claim, and the Workflow tool is an explicitly sanctioned Elephant-only
dispatch mechanism
(`plugins/pipeline-core/skills/pipeline-start/references/workflow-dispatch.md`)
— every commit produced through it should be just as machine-verifiable as
one produced through a direct Agent-tool dispatch. As long as this gap
stands, every Workflow-tool-dispatched commit's authorship trailer is
structurally unverifiable, which will surface as a repeat Critic finding on
every future package that uses the Workflow tool for a Goldfish fan-out.

## Candidate shape (not a spec)

- Confirm the actual root cause: read how `agent()` results are surfaced
  back to the calling Elephant session and whether the standard
  dispatch-record-writing step (used by the template-built Agent-tool path)
  is simply never invoked for a Workflow-tool dispatch, or invoked but
  writing to a path `dispatch-authorship-verify.mjs` doesn't look at.
  `workflow-dispatch.md` may already document an expected evidence shape
  for `agent()` dispatches that just isn't being produced — check before
  assuming a net-new artifact format is needed.
- Either have the Elephant write the standard `dispatch-record-<TASK_ID>.json`
  itself immediately after a Workflow-tool `agent()` call returns (mirroring
  what a goldfish subagent would have written for itself), or extend
  `dispatch-authorship-verify.mjs` to accept an equivalent Workflow-tool-native
  evidence shape if one already exists.

## Acceptance

- A Workflow-tool `agent()` dispatch that lands a commit with a `Dispatch:
  <ID> (goldfish)` trailer produces a `dispatch-record-<TASK_ID>.json`
  artifact (or equivalent) that `dispatch-authorship-verify.mjs` recognizes
  and passes, with no manual reconstruction after the fact.
- Existing template-built Agent-tool dispatches are unaffected.

## Root cause confirmed, 2026-08-24

Read-only research fork investigation (not this item's own author) confirmed:
**process gap, not tooling gap.** `dispatch-authorship-verify.mjs` treats a
Workflow-originated `Dispatch:` trailer identically to an Agent-tool one —
nothing structurally prevents an `agent()` call from producing the record.
`plugins/pipeline-core/skills/pipeline-start/references/workflow-dispatch.md`
already assumed (never stated outright) that every `agent()` prompt carries
the record-writing instruction because it's supposed to be
`templates/prompts/goldfish-task.md`'s field 6 verbatim — but nothing forced
that, and CLAUDE.md already names a prior, identical failure on this exact
path (NVA-WFDISP-1, freehand/abbreviated Workflow prompts).

**Mitigation applied, commit `00e23bc7`:** added an explicit, checkable
pre-dispatch step to `workflow-dispatch.md` — grep the actual CONSTRUCTED
`agent()` prompt string (not the template file) for the literal substring
`dispatch-record` before calling `agent()` on a dispatch expected to commit
with a trailer. **This is a process/behavioral mitigation, not a structural
guarantee** — same category as the tool-budget base cap (a discipline the
Elephant follows, not a hook-enforced check) — so this item stays `open`
rather than closing outright. No Workflow-tool dispatch has landed since
this fix to empirically confirm it holds; re-verify the next time the
Workflow tool is used for a committing dispatch, and close this item only
once that confirmation exists (or a stronger structural check is built, if
the process fix proves insufficient).

## Triage — 2026-08-25 (AGY-SWEEP re-visit)

- **Decision:** `implemented` (partial — hardens the existing mitigation;
  does not itself close the item).
- **What was built:** the 2026-08-24 mitigation (`00e23bc7`) only closes
  the failure mode it diagnosed — a constructed `agent()` prompt missing
  the record-writing instruction entirely. It has a real, distinct gap: a
  prompt that correctly carries the instruction can still land a commit
  with no record if the dispatch truncates or is resumed before reaching
  that step (`guardrails/token-budget.md` TB-06's ~50-call cliff is
  documented elsewhere in this same repo as a live, recurring failure
  mode, not a hypothetical one) — a pre-dispatch prompt-text grep cannot
  detect a post-prompt failure. Added a second, POST-return layer to
  `plugins/pipeline-core/skills/pipeline-start/references/workflow-dispatch.md`:
  as part of the same post-`agent()`-return check the file already
  requires ("Never trust a returned result"), the Elephant now also
  checks whether `evidence/dispatch-record-<TASK_ID>.json` actually
  exists for a task id that landed a `Dispatch: <TASK_ID> (goldfish)`
  commit, and writes it itself immediately if not — mirroring what the
  goldfish would have written. This makes the artifact's existence an
  Elephant-owned guarantee instead of trusting subagent compliance with
  an instruction it may never reach.
- **Why the item stays open:** this dispatch (a Goldfish sweep item) has
  no Workflow/Agent-tool fan-out access itself (`workflow-dispatch.md`:
  "Only the Elephant orchestrates fan-out") and therefore cannot produce
  the genuine end-to-end confirmation the item's own Acceptance criteria
  and the prior Triage require — an actual Workflow-tool `agent()`
  dispatch landing a real commit, checked post-hoc against
  `dispatch-authorship-verify.mjs`. That remains for the next live
  session that dispatches through the Workflow tool; re-verify then and
  close only once that confirmation exists (unchanged from the prior
  Triage's own closure bar).
- **Verification:** doc-only change; no script references this file
  (checked: no hit in `plugins/` or `harness/` for
  `workflow-dispatch.md`), so no automated suite gates its content —
  same evidentiary category as the prior `00e23bc7` mitigation. Read
  through for markdown well-formedness and cross-checked the claimed
  root-cause distinction against the item's own "Root cause confirmed"
  section above.
- **Commit:** see this repo's history for the commit landing this Triage
  update and the `workflow-dispatch.md` edit together.

## Progress note (2026-08-29, backlog sweep)

Re-investigated 2026-08-29 (NVA-CF-BL12-AUTHVERIFY). dispatch-authorship-verify.mjs
already correctly FAILs (record-missing), not UNVERIFIABLE, on a Dispatch: trailer
with no matching evidence/dispatch-record-<ID>.json for the goldfish role --
confirmed live against dispatch-authorship-verify.mjs's verifyCommit() and its
existing passing test case (b). The remaining gap is narrower than previously
stated: the Workflow tool itself still does not automatically write the
dispatch-record artifact for every dispatch, and this checker is not yet wired
into harness/scripts/verify.mjs as a hard registered gate (TP-3 protected, not
attempted).
