---
schema: pipeline.backlog-item.v1
id: pipeline.briefing-model-field-contradicts-agent-definition
type: defect
owner: pipeline
status: closed
created: 2026-08-08
due: 2026-08-22
closed_at: 2026-08-17
closure_repository: self
closure_commit: e7d729042a1dfdf6439c74959b143eade6d7870c
closure_evidence: backlog/items/2026-08-08-a-briefings-model-field-can-contradict-the-agent-it-dispatches.md
source: "Three dispatches in the 2026-08-08 decisions wave were briefed 'claude-opus-5 at xhigh' and ran on claude-sonnet-5. Two of them reported the mismatch themselves; the Elephant's first reading of it was wrong in the opposite direction."
---

# A briefing's model field can contradict the agent it dispatches, and nothing notices

## What happened

Three dispatches in one wave carried `Model: claude-opus-5 at xhigh` in dispatch
metadata field 6 and executed on `claude-sonnet-5`. Two of the executing agents
noticed and disclosed it; the third did not.

The dispatcher's first reading was that model discipline (MP-05) had been violated
by the runtime. It had not. `plugins/pipeline-core/agents/goldfish-deep.md` carries
`model: sonnet` with `effort: xhigh`, and its own comment states the design: the
deep tier is *implement-tier model run at high effort*, not a higher-capability
model. Sonnet was correct. **The briefing was wrong**, three times, written by the
Elephant.

## Why that is worse than the reading it replaced

A runtime that silently downgrades a model would be a serious defect but a visible
one — it contradicts a stated intent. What actually happened is quieter: the
briefing field is **decorative**. It is read by humans and by the Critic as a
record of which model did the work, and nothing compares it to the agent definition
that actually decides.

So the failure mode is a *false record*, not a wrong execution. MP-05 exists so
that a dispatch names its model rather than silently inheriting the session's. A
field that can name a model the dispatch did not use satisfies the letter of that
rule while defeating its purpose: the next reader, including a Critic assessing
whether guardrail code got an adequate tier, is told something untrue.

It also cost review attention. The dispatcher raised the mismatch to the PO as a
discipline violation before checking the agent definition, which is the wrong order
and produced a wrong statement that had to be corrected.

## What is not the defect

The tier assignment itself is fine and should not be changed here. `goldfish-deep`
being sonnet-at-xhigh is a deliberate, documented decision with its rationale in
the file. Nothing in this item argues for a different model.

## Direction, not a design

1. **Make the contradiction detectable.** `guard-dispatch.mjs` already refuses a
   briefing missing a required field — it rejected an omitted ruleset SHA in this
   same wave. The same place can compare a stated model against the dispatched
   agent's definition and refuse a disagreement.
2. **Decide which side wins when they differ.** A briefing that names a model the
   agent definition does not provide is either an error (refuse) or an override
   request (honour it, and record that an override happened). Both are defensible;
   silence is not.
3. **Or remove the field's model half entirely** and have the record derive from
   the agent definition. If the value cannot be authored correctly by hand — and
   three consecutive dispatches suggest it cannot — deriving it is more honest than
   asking for it.
4. **Note the interaction with a real override.** The dispatch layer does accept a
   per-invocation model override. Whatever is decided must distinguish "the briefing
   is wrong" from "the dispatcher deliberately overrode the tier and said why",
   because MP-05/MP-07 explicitly allows the second with a stated rationale.

## Triggering situation

Any hand-written dispatch briefing. Observed three times in one wave, by three
different dispatches against the same agent type.

## Related

- [`policies/model-policy.md`](../../policies/model-policy.md) — MP-05 and MP-07,
  the rules this field exists to satisfy.
- `2026-08-08-long-dispatches-truncate-before-emitting-their-report.md` — same
  wave; both are failures of a record rather than of the work.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:** Elephant's recommendation accepted — Option C combined with
  B: drop the model field's hand-authored half and derive the record from
  the dispatched agent's actual definition; keep a distinct explicit
  override path for the genuine MP-05/07 upgrade case (dispatching
  guardrail work at a higher tier with a stated rationale).
- **Rationale:** PO, 2026-08-12: "empfehöung" [empfehlung].
- **Assignment (if accepted):** queued for implementation this session.
- **Date:** 2026-08-12

## Closure (2026-08-17)

Verified against current source: `templates/prompts/goldfish-task.md:195`
now requires `agentType` (the exact `subagent_type` invoked) and derives
field 6's `model`/`effort` from that agent's own definition file rather
than hand-typing them, citing itself as "NVA-BL-78 — derive the model, do
not hand-type it twice." `plugins/pipeline-core/scripts/dispatch-authorship-verify.mjs:373-377`
cross-checks `agentType` against the recorded model/effort and downgrades a
would-be PASS to FAIL, classification `model-mismatch`, when they disagree
— exactly Option C+B as decided. Landed commit
`e7d729042a1dfdf6439c74959b143eade6d7870c`, "fix(dispatch-authorship):
derive recorded model from the dispatched agent definition". Closing.
