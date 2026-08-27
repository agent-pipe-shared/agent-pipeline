---
schema: pipeline.backlog-item.v1
id: pipeline.repository-agent-definition-is-inert-runtime-loads-installed-copy
type: defect
owner: pipeline
status: open
created: 2026-08-27
source: "Directly measured during the 2026-08-27 Nova-A candidate session: four deep-tier dispatches truncated at a maxTurns the repository had already raised"
---

# A changed agent definition in the repository has no effect — the runtime loads the installed copy

## Description

Commit `ebf2ea0a` raised `maxTurns` for `goldfish-deep` to 80 in
`plugins/pipeline-core/agents/goldfish-deep.md`. The copy installed under the local
marketplace root still said 50. The runtime loads the installed copy, so the change
was inert: dispatches were cut off mid-work at exactly 50 turns, two of them without
emitting any report at all, one after roughly 238k tokens of work.

The expensive property is not the staleness itself but its invisibility. The change
looks landed in `git log`, the file in the checkout says 80, and nothing warns,
compares, or fails. The divergence only becomes observable at the cliff, and by then
it presents as lost work rather than as a configuration problem.

This is the same failure shape as a candidate stamp without a version bump, one layer
down: an artifact that is authoritative in the repository but not the one actually
loaded.

## Triggering situation

The 2026-08-27 Nova-A candidate session. Measured, not inferred: the repository copy
and the installed copy were read side by side after the fourth truncation, and the
installed copy was six days behind — four diverging agent definitions, a diverging
`hooks.json`, several diverging guards, and three guards absent from the installed
copy entirely.

A related observation from the same session, worth keeping attached: the marketplace
attestation that would have caught this (`AGY-MKTATTEST-1` in `guard-push.mjs`) exists,
but was deliberately downgraded from a hard verify assertion to a warning, because it
went red on every commit touching `plugins/pipeline-core/**`. The warning was present
and read as "expected during active development."

## Affected artifact

- `plugins/pipeline-core/agents/*.md` — the definitions whose frontmatter is inert
- `plugins/pipeline-core/hooks/` — the same class, and the more serious one: a guard
  that is absent from the installed copy is not enforcing
- `plugins/pipeline-core/scripts/pipeline-start-preflight.mjs` — where the freshness
  observation already sits, and the natural home for a comparison
- `plugins/pipeline-core/hooks/guard-push.mjs` — `AGY-MKTATTEST-1`, the existing
  push-time attestation

## Proposal

Technical enforcement rather than a rule to remember: a check that compares the
repository copies under `plugins/pipeline-core/agents/` and
`plugins/pipeline-core/hooks/` against the installed copy and fails, naming the
diverging files, when they differ.

Two things are genuinely open and should be decided rather than assumed:

1. **Fail-closed or loud warning.** A hard failure during active plugin development
   would fire constantly, which is exactly what caused `AGY-MKTATTEST-1` to be
   downgraded. A session-start observation that must be acknowledged may be the
   better shape than a blocking gate.
2. **Whole files or declared fields.** Comparing whole files is honest but noisy
   during development; comparing only the frontmatter fields that actually change
   runtime behaviour (`maxTurns`, `model`, `tools`) is quieter but can miss a guard
   that is absent entirely.

This also connects to the canary discussion: `observeAntigravityHardEnforcement`
answers "did a hard-enforcement hook fire this session", but nobody answers "are the
guards firing in this session the ones this checkout defines".
`localPluginInstallSourceObservation()` already produces the comparison; it surfaces
only in verify and at push time, not at session start.

**Interim measure, already in force:** tool budgets for a dispatch are derived from
the INSTALLED definition, never from the repository copy.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:**
- **Rationale:**
- **Assignment (if accepted):**
- **Date:**
