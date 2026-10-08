---
schema: pipeline.backlog-item.v1
id: pipeline.critic-scratch-name-randomness-has-no-admitted-command
type: defect
owner: pipeline
status: open
created: 2026-10-06
source: "Observed live during the Alfred night run, 2026-10-06 (two Opus Critic dispatches, GPGL-5/6 delta and FANOUT bundle remainder)."
sprint: alfred
done_when: manual
---

# A Critic's scratch-directory randomness has no admitted command, and one improvisation never terminated

## Description

`templates/prompts/critic-review.md` ("Scratchpad isolation") tells the Critic to create
`scratch/dispatch/<codename>-<random-hex>/` with at least 8 hex characters "from a CSPRNG (e.g. `openssl rand -hex 4`)"
and a bare `mkdir`. The Critic agent has no Write tool, and the closed shell grammar admits neither `openssl` nor a
bare `mkdir` of that shape. In one dispatch the Critic improvised a `sed` read of `/dev/urandom` started in the
background; it never terminated, held a CPU core, and the Critic's grammar admits no kill, so the dispatcher had to stop
it. In a second dispatch the notes write itself was refused (`GUARD-DEVPLAN-SHELL`). Both Critics therefore reported
"persistence unavailable", which is the gap already filed as
`backlog/items/2026-08-27-critic-dispatches-cannot-persist-their-scratch-notes.md`; this item adds the randomness
instruction and the runaway-process hazard it invites.

## Triggering situation

Critic records `specs/sprint-alfred-epic/evidence/critic-2026-10-05/gpgl-5-6-delta.md` (operational incident) and
`specs/sprint-alfred-epic/evidence/critic-2026-10-05/fanout-bundle-remainder.md` (persistence unavailable).

## Affected artifact

`templates/prompts/critic-review.md` (and its vendored copy under `plugins/pipeline-core/templates/prompts/`),
`plugins/pipeline-core/agents/critic.md`, the shell grammar in `templates/prompts/agent-obligations.md`.

## Proposal

Give the Critic one admitted, bounded route that creates its own fresh scratch subdirectory and writes
`critic-notes.md` inside it (a plugin script that draws the suffix with `node:crypto`, creates the directory
atomically, and appends notes), and replace the `openssl` example in the template with that script. Until then, the
template should say plainly that a Critic without that route reports persistence as unavailable and must not
improvise a randomness source.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:** fixed in source — closes after the 0.7.0 candidate host checklist (status stays `open` until then).
- **Rationale:** commit(s) `f95fc6998`.
- **Assignment (if accepted):** sprint-alfred-epic close-out batch.
- **Date:** 2026-10-08.
