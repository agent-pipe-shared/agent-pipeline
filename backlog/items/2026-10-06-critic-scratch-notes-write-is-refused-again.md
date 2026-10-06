---
schema: pipeline.backlog-item.v1
id: pipeline.critic-scratch-notes-write-is-refused-again
type: defect
owner: pipeline
status: open
created: 2026-10-06
source: "Live observation, night run 2026-10-06 (Claude × native Windows × own repo): DOCCAP2 and GLREP-t2 Critic dispatches; earlier the same night FX5B, package-split and GPGL-8 Critic rounds reported notes persistence refused or unavailable."
sprint: alfred
done_when: manual
---

# Critic scratch-notes writes are refused again

## Description

The Critic contract (CR-06-D) requires the Critic to persist its candidates and result to `critic-notes.md` inside its
own fresh `scratch/dispatch/<codename>-<hex>/` directory before returning. The Critic agent has no Write tool, so it
writes through Bash. On 2026-10-06 that route was refused by `guard-lifecycle-ready` with `GUARD-DEVPLAN-SHELL`
(lane `opaque-interpreter-code`) for a `node -e` write (DOCCAP2 Critic: no notes file at all) and for an
`appendFileSync` call, while a `writeFileSync` to the same file was admitted before and after (GLREP-t2 Critic). Several
earlier Critic rounds the same night recorded "notes persistence unavailable" or "final notes append refused". The
closed item `2026-08-27-critic-dispatches-cannot-persist-their-scratch-notes.md` covered this class; the behaviour has
regressed or was only partly fixed.

## Triggering situation

DOCCAP2 Critic (refused `node -e` write, report delivered only as a message) and GLREP-t2 Critic (one refused append,
one budget call lost), 2026-10-06 ~05:00-05:30 local.

## Affected artifact

`plugins/pipeline-core/hooks/guard-lifecycle-ready.mjs` (devplan shell lane classification for writes into the
caller's own `scratch/` subdirectory), `templates/prompts/critic-review.md` (the documented persistence route),
`plugins/pipeline-core/agents/critic.md` (tool grant).

## Proposal

Test-first: a fixture Critic dispatch whose notes write into its own fresh scratch subdirectory is admitted for each
documented write shape (create and append), and a write outside it stays refused. Then either admit exactly that
shape for the Critic role or give the Critic a sanctioned notes-writer command named in the template. Due before the
0.7.0 release candidate.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:**
- **Rationale:**
- **Assignment (if accepted):**
- **Date:**
