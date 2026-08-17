---
schema: pipeline.backlog-item.v1
id: pipeline.no-pre-dispatch-check-catches-a-model-deviating-from-configured-routing
type: workflow-improvement
owner: pipeline
status: open
created: 2026-08-17
source: "Live, same-session incident: the Elephant dispatched NVA-VENDORSYNC-1 to goldfish-deep with an explicit `model: opus`/`max` override and a stated MP-05/MP-07 rationale (architecture/guardrail-adjacent). goldfish-deep's actual configured default is sonnet at effort xhigh (plugins/pipeline-core/agents/goldfish-deep.md frontmatter, matching pipeline.user.yaml's models.implement.claude routing). The PO caught the deviation live in chat and asked how to stop this recurring silently across sessions; not investigated or fixed here, filed for future hardening per the PO's own framing (\"das braucht auch später eine Härtung\")."
---

# `guard-dispatch.mjs` verifies a model is NAMED, never that it matches the CONFIGURED routing — a stated-but-unjustified escalation currently passes silently

## Description

Two checks exist today around Goldfish/Critic dispatch model discipline, and
both have a real, narrower scope than "the dispatched model matches
policy":

1. **`guard-dispatch.mjs`** (PreToolUse hook on the Agent/Task tool,
   `plugins/pipeline-core/hooks/guard-dispatch.mjs`, logic in
   `lib/dispatch-policy.mjs`) — its `DISPATCH-NO-MODEL` finding
   (`dispatch-policy.mjs:112`/`:126`) only checks that *some* model string is
   present in the briefing's Dispatch metadata field. It never reads the
   invoked `agentType`'s own frontmatter default (e.g.
   `plugins/pipeline-core/agents/goldfish-deep.md`'s `model: sonnet`), never
   reads `pipeline.user.yaml`'s `models.<phase>.<runner>` routing table, and
   never compares the declared model against either. A dispatch that names
   ANY model — including one that silently deviates from the configured
   routing with a plausible-sounding but PO-unvalidated rationale — passes
   this gate exactly like a routing-compliant one.
2. **`dispatch-authorship-verify.mjs`** — runs AFTER the fact, at
   Critic-review time, against the committed dispatch record. Per
   `templates/prompts/goldfish-task.md`'s own documented contract, it accepts
   a `modelOverride` field as a legitimate, honoured deviation as long as it
   carries a non-empty `rationale` string — it checks that a reason was
   *given*, not that the reason was *good*. It also only ever runs if a
   Critic review is actually dispatched for that work package; ordinary
   implementation work with no guardrail/architecture trigger never reaches
   it at all.

**Net result, demonstrated live:** an Elephant can self-escalate a
`goldfish-deep` dispatch (configured default: sonnet/xhigh) to
`opus`/`max` by writing a one-sentence MP-07 justification in the briefing,
and nothing in the tool chain flags this as a deviation from configured
routing — at dispatch time or afterward — unless a human happens to be
reading along live, which is what actually caught it this time.

## Affected artifact

`plugins/pipeline-core/hooks/guard-dispatch.mjs`,
`plugins/pipeline-core/lib/dispatch-policy.mjs` (the `DISPATCH-NO-MODEL`
check and its neighbors), `plugins/pipeline-core/scripts/dispatch-authorship-verify.mjs`
(the post-hoc, rationale-presence-only check), `pipeline.user.yaml`
(`models.<phase>.<runner>` — the routing table nothing pre-dispatch reads).

## Proposal

Not designed here — filed as a capability gap, per the PO's own framing
("this needs hardening later"), not as a same-session guard change (guard
logic is guardrail-tier work, MP-07, needs its own dispatch + Critic review,
not a quick patch). Directions worth weighing by whoever picks this up:

1. A pre-dispatch check in `guard-dispatch.mjs`/`dispatch-policy.mjs` that
   resolves the invoked `agentType`'s frontmatter default model/effort AND
   `pipeline.user.yaml`'s routing table, and — when the briefing's declared
   model/effort differs from both — requires a structurally distinct,
   clearly-labelled override marker in the prompt text (not just any
   sentence containing the word "rationale") before allowing the dispatch
   through; still fail-open on anything it cannot resolve, matching this
   guard's existing stated design philosophy.
2. Surfacing every such override — even a syntactically well-formed one — as
   a visible line in the Elephant's own bootstrap/session output or a
   running session log, so a human following along (or reviewing the
   transcript later) doesn't have to notice it buried in a long dispatch
   prompt to catch a routing deviation.
3. Whatever the mechanism, it should not make a genuine MP-05/MP-07
   escalation impossible — only make an UNEXAMINED one harder to ship
   unnoticed.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:** accepted — confirmed directly against current source
  (`dispatch-policy.mjs:112`/`:126`, `goldfish-deep.md` frontmatter,
  `pipeline.user.yaml:138-146`) before filing, not just trusted from the
  live incident.
- **Rationale:** a real, demonstrated gap between "the tool chain enforces
  routing discipline" (the CLAUDE.md/model-policy framing) and what
  `guard-dispatch.mjs` actually checks (presence, not correctness); worth
  closing given it is exactly the kind of silent deviation the existing
  Model discipline hard rule in CLAUDE.md was written to prevent.
- **Assignment:** queued for a future design/dispatch session; guardrail-tier
  work (MP-07), not a same-session patch.
- **Date:** 2026-08-17
