---
name: advisor-consult
description: "Ready dispatch pattern for the bound read-only `consult-advisor` subagent (Task-tool subagent_type: consult-advisor) - the MANDATORY primary workaround (MP-26g) when the advisor tool reports unavailable/error in an `advisor`-profile session, or when the session-start advisor readiness probe (session-bootstrap.md Step 1b) fails. Dispatch metadata: log the consult under the advisor-tier ledger label (MP-26g telemetry), and set the Task-tool `model` invocation parameter to your configured advisor model's enum value (`pipeline.user.yaml -> models.advisor`) - the enum, not the ledger label; EXACTLY one question per consult; hard read-only (tools: Read, Grep, Glob only - no Edit/Write/Bash, no repo mutation). The answer feeds the Elephant's own judgment, never auto-applied. Use PROACTIVELY the moment an advisor call returns unavailable/error - do not silently drop advisory and do not unilaterally switch the main model up to a higher-capability tier instead of running this pattern (MP-26g)."
argument-hint: "<one question for the advisor-replacement consult>"
---

# advisor-consult — read-only advisor consult subagent (advisor-outage workaround, MP-26g)

Normative source (canon pointer, not a runtime read): `policies/model-policy.md`
MP-26(g). This skill is the STANDING mechanism that policy prescribes; running it is not optional
once the trigger below fires.

## When to use (hard trigger, MP-26g)

The session runs profile `advisor` AND an advisor call — the session-start readiness probe
(`harness/session-bootstrap.md` / `pipeline-start` SKILL.md, Step 1b) or any later advisor
consult — returns `unavailable` or an error.

**This is the MANDATORY PRIMARY response.** Two documented anti-patterns are explicitly NOT
substitutes for running this skill (MP-26g — a real observed failure mode): (i) silently dropping
advisory and continuing without any advisor channel, and (ii) unilaterally switching the session's
MAIN model up to a higher-capability tier (e.g. the design-tier model) in reaction to the outage.
Escalating the ADVISOR channel to a higher-capability model (`/advisor <higher-tier-model>`) stays
available, but only as an OFFER the Elephant puts to the PO (MP-26g point 3) — never a unilateral
escape the session takes on its own.

Do NOT skip the PO's immediate notification (MP-26g point 1) — this skill is the point-2 workaround,
not a replacement for the point-1 alert.

## Dispatch pattern (ready one-liner)

**Bound hard-read-only agent:** `plugins/pipeline-core/agents/consult-advisor.md`
defines the `consult-advisor` agent with a HARD `tools: Read, Grep, Glob` allowlist (no Write/Edit/
Bash at all — enforced by the harness, not just by prompt convention). Dispatch via the **Task
tool**:

- `subagent_type: consult-advisor` — the bound agent above, **never `general-purpose`** for this
  pattern anymore (the read-only contract used to be prompt-level-only; it is now a hard allowlist).
- Task-tool **`model` invocation parameter:** set it to the model ENUM VALUE the Task tool accepts
  for your configured advisor tier (`pipeline.user.yaml -> models.advisor`). Keep this ENUM VALUE
  distinct from the dispatch-ledger/telemetry LABEL you log the consult under (EL-21). Some setups
  use a human-readable label in the ledger (the one the close-ritual "peculiarities" line uses for
  the advisor-model cost share) that is NOT a valid Task-tool `model` value — state BOTH explicitly
  and keep them apart, so a session running this pattern under advisor-outage pressure does not pass
  the label string where the enum value is expected. This mirrors the same per-dispatch
  model-override mechanism MP-07 already established for the Critic's escalation to a
  higher-capability review model (`plugins/pipeline-core/agents/critic.md`: the escalation is set by
  the Elephant per dispatch).

Dispatch prompt template (fill in exactly ONE question, nothing else):

```
role=consult-advisor, ledger label = advisor tier (Task-tool invocation parameter is model=<your configured models.advisor enum>, which may differ from the ledger label)

You are a read-only consult subagent standing in for an unavailable advisor
(MP-26g workaround). You have Read/Grep/Glob ONLY - a hard
allowlist enforced by the `consult-advisor` agent definition, not just a prompt
convention. Do NOT use Write, Edit, or any Bash command.

Answer exactly ONE question from repo/context inspection, then stop:

{{THE_ONE_QUESTION}}

Return your answer as prose. Do not propose or make any repo changes yourself -
your answer feeds the Elephant's own judgment, it is never auto-applied.
```

Rules (hard, mirror MP-26g verbatim):

- **Exactly ONE question per consult.** No batching, no multi-turn follow-up loop inside the same
  dispatch — a second question is a second, separate dispatch.
- **Read-only, no exceptions.** If the question cannot be answered from Read/Grep/Glob alone, that
  is itself the answer to report back ("not answerable read-only, needs X") — never loosen the
  contract to get an answer.
- **The answer feeds judgment, it is never auto-applied.** The Elephant reads the subagent's prose
  answer and decides — exactly like an advisor consult would have worked, never like a Goldfish
  diff the Elephant merges unreviewed.

## Using the answer

- Treat the returned prose exactly as an advisor answer would have been treated — input to the
  Elephant's own judgment at the decision point that triggered the original advisor call, never a
  verdict to apply mechanically.
- Log the consult in the session's dispatch ledger (EL-21, `roles/elephant.md`) like any other
  subagent dispatch: `role=consult-advisor`, the advisor-outage trigger, and the question asked —
  this is what lets the close ritual's telemetry line (MP-20, "peculiarities") show the
  advisor-model cost share correctly and lets a later session/Critic audit the trail.

## Relationship to the full MP-26(g) sequence

1. Immediate notification to the PO on the FIRST failure (this skill does not replace that alert).
2. **This skill** — the standing, mandatory-primary workaround.
3. Offer `/advisor <higher-tier-model>` to the PO as an ADDITIONAL option, never as a silent
   unilateral switch of the session's main model.

## Live-validation caveat

The advisor-outage TRIGGER path (session-bootstrap.md readiness probe, Step 1b) is currently
specified but not yet live-validated against a real advisor outage — a follow-up item, since it
needs an actual outage to observe. This skill's own dispatch pattern (Task-tool invocation,
`consult-advisor` agent, prompt contract) is immediately usable independent of that open validation
item.
