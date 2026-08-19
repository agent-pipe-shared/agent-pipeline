---
schema: pipeline.backlog-item.v1
id: pipeline.dispatch-text-model-field-loses-to-a-subagent-definitions-own-frontmatter-pin
type: defect
owner: pipeline
status: closed
created: 2026-08-18
source: "Incremental handover-rotation extraction pass (ADR-0066 Decision 6/7), 2026-08-18, second rotation batch ('The round's own route violation, and where it came from' entry). Finding surfaced by a read-only research fork."
---

# Naming a model in dispatch text has no effect when the target subagent definition pins its own `model:` in frontmatter — only a tool-layer override wins

## Description

`docs/state.md`'s second rotation batch records a live incident: a
mandated MP-07 model escalation (Critic dispatch, text explicitly named
`opus at max`) actually ran on `sonnet` instead. Root cause: the target
subagent definition (`plugins/pipeline-core/agents/critic.md`) pins its own
`model:` in frontmatter, and that pin wins over whatever the dispatch
TEXT says — only a tool-layer model override (the `model` parameter on the
Agent/Task call itself) actually changes which model runs. CLAUDE.md's
"Model discipline" Hard Rule requires every dispatch to name its model
explicitly in the "Dispatch-Metadaten" field, but neither that rule nor
`policies/model-policy.md` documents this frontmatter-pin-wins mechanism —
so naming the model correctly in the briefing text can still silently fail
to route to that model.

## Triggering situation

Incremental extraction pass over `docs/state.md`'s second rotation batch
before that content is archived (ADR-0066 Decision 6/7). Checked
`policies/model-policy.md` and the critic-review skill docs for this
specific mechanism — not present.

## Affected artifact

`policies/model-policy.md` (needs to document that a subagent definition's
own `model:` frontmatter pin overrides dispatch-text model naming, and that
only the tool-layer `model` parameter is authoritative for an actual
escalation), and/or CLAUDE.md's "Model discipline" Hard Rule (could note
this failure mode directly, since it already exists to close exactly this
class of silent-inheritance problem for the text-naming case).

## Proposal

Not yet designed in detail. Likely direction: document the mechanism in
`policies/model-policy.md`, and consider whether dispatch guidance/tooling
should warn (or the dispatch template should instruct) when a text-named
model differs from the target subagent's own frontmatter pin, so a real
MP-07-class escalation cannot silently no-op again.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:** not yet decided — filed to preserve the finding.
- **Rationale:** real, already bit a mandated escalation once; documenting
  the mechanism is cheap, but deciding whether/how to add tooling
  enforcement is a separate, considered call.
- **Date:** 2026-08-18

## Closure, 2026-08-19 (verified live against current code, not against status text)

Confirmed resolved in code by an independent, code-first verification pass
(Workflow task wdyd7rk9g, 2026-08-19) run in response to a PO directive to
actively check every open backlog item against current code rather than
trusting frontmatter status. The item's own frontmatter/Triage text had not
been updated to reflect the landed fix; this closure catches that drift.

policies/model-policy.md lines 127-133 now contain a full "MP-29" section ("A subagent definition's own frontmatter model: pin overrides dispatch-TEXT model naming; only the tool-layer model parameter is authoritative"), documenting the exact mechanism, the live incident (Critic dispatch with "opus at max" that ran on sonnet due to plugins/pipeline-core/agents/critic.md's frontmatter pin), a required tool-layer-parameter rule, and a "how to check" procedure — precisely what the item's Proposal asked to be documented. Additionally, CLAUDE.md's "Model discipline" Hard Rule (visible in this session's project instructions) now states: "a target subagent definition's own frontmatter model: pin overrides it, so an actual escalation needs the tool-layer model parameter on the dispatch call (policies/model-policy.md MP-29)" — both named artifacts from the item's Affected-artifact section have been updated. The documentation gap the item describes no longer exists.
