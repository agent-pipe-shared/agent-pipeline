---
schema: pipeline.backlog-item.v1
id: pipeline.state-routes-refused-once-a-registry-catalogue-exists
type: defect
owner: pipeline
status: open
created: 2026-10-19
source: "Live run on this repository after the c27576438 push (2026-10-19), PF-54"
sprint: none
done_when: manual
---

# State routes are refused once a registry catalogue exists

## Description

`pipeline-state.mjs` admits only eight subcommands through the session-authority boundary
(`STATE_AUTHORITY_ENTRIES`: set-feature, cancel-submitted-plan, cancel-mixed-plan-state,
reopen-design, seal-plan-approval, set-gate-estimate, revoke-plan, and set-phase without
`--verify-command`). It refuses every other subcommand with
`SDC-AUTHORITY-UNAVAILABLE` (`state-outer-companion-route-not-adopted`) as soon as
`.git/agent-pipeline/session-authority/catalogue.json` exists. The refusal came in with
d02409a8a. No test covers it.

The first governed item dispatch creates the catalogue. From then on these are refused:

- `prepare-push-subject`, so `push-prepare` reports `subject-hash` failed;
- `approve-push`;
- `close-feature`;
- `set-phase --verify-command`;
- by the same rule, every other subcommand that is not in the map.

The refusal was measured live on this repository. At 18:04 UTC a PF-52 migration had moved
the old catalogue aside and found none to re-create, so `push-prepare` passed and c27576438
was pushed. The next dispatch attempt created a fresh catalogue. After that,
`prepare-push-subject` was refused.

Any repository that has had a dispatch holds a catalogue, and the PO's main project does.
Push, close and verify-phase there are refused the same way.

`pipeline-state.mjs` is protected (PB-SANCTIONED-WRITER), so a fix needs the PO's override
ceremony.

## Acceptance

- Push, close-feature and set-phase --verify-command work while a catalogue exists. Each is
  either adopted through the state authority companion or proven not to write registry-bound
  state.
- A pin covers dispatch → push-prepare → approve-push → close-feature on a repository with a
  catalogue.
