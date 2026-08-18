---
schema: pipeline.backlog-item.v1
id: pipeline.dispatch-text-model-field-loses-to-a-subagent-definitions-own-frontmatter-pin
type: defect
owner: pipeline
status: open
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
