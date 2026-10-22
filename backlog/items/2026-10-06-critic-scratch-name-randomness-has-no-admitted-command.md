---
schema: pipeline.backlog-item.v1
id: pipeline.critic-scratch-name-randomness-has-no-admitted-command
type: defect
owner: pipeline
status: closed
created: 2026-10-06
closed_at: 2026-10-22
closure_repository: self
closure_commit: 35455319327d44d5519671a13f0956583dd99a21
closure_evidence: backlog/items/2026-10-06-critic-scratch-notes-write-is-refused-again.md
source: "Observed live during the Alfred night run, 2026-10-06 (two Opus Critic dispatches, GPGL-5/6 delta and FANOUT bundle remainder)."
sprint: alfred
done_when: manual
---

**Rejected as a duplicate (backlog grooming 2026-10-22):** merged into `backlog/items/2026-10-06-critic-scratch-notes-write-is-refused-again.md`. Both describe the Critic having no admitted route to create its own scratch directory and persist critic-notes.md; both carry the identical triage (fixed in source, commit f95fc6998) and the randomness item's 2026-10-22 verification lives in the notes-write item's registered pin test (lib/pins/critic-scratch-notes-write-is-refused-again.test.mjs). One admitted Write/Edit notes route closes both. All content of this item is carried over verbatim into that item's section "Merged from `2026-10-06-critic-scratch-name-randomness-has-no-admitted-command`"; nothing is lost.

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

## Verification 2026-10-22: the pin the item asked for

`templates/prompts/critic-review.md`, its vendored copy and `plugins/pipeline-core/agents/critic.md` carry no random-name,
`openssl`, `/dev/urandom`, `mktemp` or CSPRNG instruction, and each names the single admitted route (Write/Edit only, the
guard-allocated `critic-<authenticated-native-agent-id>` target, persistence reported as unavailable when admission is
missing). Nine cases were added to `plugins/pipeline-core/lib/pins/critic-scratch-notes-write-is-refused-again.test.mjs`
(the registered pin of the same notes lane): the no-randomness and route checks for each of the three texts, canonical
versus vendored paragraph equality, a mirror that proves the detector catches the old instruction, and a check that the
closed shell grammar still admits no randomness command. Counted result, run alone on 2026-10-22: 28 cases, 26 pass,
0 fail, 2 skipped (the two typed host-limitation skips for synthetic mode bits), 0 todo.

Residual, not changed here: `roles/critic.md` CR-03 (standard stage) still tells the Critic to create a
`scratch/dispatch/critic-<task-or-codename>-a1/` directory with a bare `mkdir`, and three texts say the Critic "already
creates" a per-dispatch subdirectory, while the template and agent now say the native dispatch guard allocates the notes
directory on the first admitted Write. The role text predates the guard-owned route and should be reconciled by the
role owner.

## Reconciled 2026-10-22: the residual role text

The residual named above is closed. There is no admitted scratch-name command to state, by design: the Critic runs no `mkdir`, no `openssl` and no random-name source. The one admitted route, as `plugins/pipeline-core/hooks/guard-dispatch-budget.mjs` defines it, is Write (create) and Edit (append) on `scratch/dispatch/critic-<authenticated-native-agent-id>/critic-notes.md`; on the first admitted Write/Edit the native dispatch guard creates that directory exclusively and binds it to the authenticated dispatch and counter, and when allocation or Write/Edit admission is unavailable the Critic returns the report as text and discloses persistence as unavailable. Reconciled to that wording, which stays authoritative in the `Scratchpad isolation` paragraph of `templates/prompts/critic-review.md`:

- `roles/critic.md` section 3 (CR-03, standard stage): the bare-`mkdir` / `-a1` step is replaced by the guard-allocated target.
- `roles/critic.md` section 5.5 (CR-06-D): "Where" no longer says the Critic already creates the directory; "How" no longer carries the superseded `node -e` write shape or the bare-`mkdir` step.
- `plugins/pipeline-core/agents/critic.md` (Report durability paragraph) and `templates/prompts/critic-review.md` with its vendored copy (Report durability paragraph): "the subdirectory you already create" now says the guard allocates it.

The vendored template stays byte-identical (`plugins/pipeline-core/scripts/check-vendored-template-sync.mjs` passes). `plugins/pipeline-core/scripts/critic-notes-write.mjs` (the AC-143 script route) is not named by any of these texts and is untouched. No pin or test was changed.

### Blocker analysis 2026-10-22

Read-only survey of the open clauses that the delivery remeasure assigned to native-host, verify-wsl, po-decision or po-signature (evidence: `specs/sprint-alfred-epic/evidence/blocker-analysis-2026-10-22/`). Status key: LINUX-RUN and WINDOWS-INTEROP-RUN are runs an agent can do from the WSL host; HOST-SESSION-NEEDED, PO-DECISION and PO-SIGNATURE are not agent work.

- **NOT-BLOCKED** — A live Critic dispatch must create its notes without an improvised randomness source
  The item was rejected as a duplicate on 2026-10-22 and merged into critic-scratch-notes-write-is-refused-again; the no-randomness checks are pinned there (9 cases, 28 run, 26 pass, 0 fail, 2 typed skips). The remaining live observation is carried by that canonical item's host clause, not this one.
