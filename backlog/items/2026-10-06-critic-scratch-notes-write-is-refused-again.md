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

- **Decision:** fixed in source — closes after the 0.7.0 candidate host checklist (status stays `open` until then).
- **Rationale:** commit(s) `f95fc6998`.
- **Assignment (if accepted):** sprint-alfred-epic close-out batch.
- **Date:** 2026-10-08.

## Merged from `2026-10-06-critic-scratch-name-randomness-has-no-admitted-command` (created 2026-10-06; merged 2026-10-22)

*Carried over verbatim from the item closed as a duplicate of this one. What is unique to it: From the duplicate: (1) the template/agent text must carry no random-name instruction (no openssl, /dev/urandom, mktemp, CSPRNG) and must say a Critic without the route reports persistence as unavailable instead of improvising; (2) the runaway-background-process hazard (a sed read of /dev/urandom that never terminated); (3) the closed shell grammar must keep admitting no randomness command. All three are already pinned by the 9 cases added to the canonical's pin, so the canonical only needs a note that these are covered.*

**Front matter of the merged item, verbatim (status/ledger fields of the original):**

```yaml
schema: pipeline.backlog-item.v1
id: pipeline.critic-scratch-name-randomness-has-no-admitted-command
type: defect
owner: pipeline
status: open
created: 2026-10-06
source: "Observed live during the Alfred night run, 2026-10-06 (two Opus Critic dispatches, GPGL-5/6 delta and FANOUT bundle remainder)."
sprint: alfred
done_when: manual
```

#### Description

`templates/prompts/critic-review.md` ("Scratchpad isolation") tells the Critic to create
`scratch/dispatch/<codename>-<random-hex>/` with at least 8 hex characters "from a CSPRNG (e.g. `openssl rand -hex 4`)"
and a bare `mkdir`. The Critic agent has no Write tool, and the closed shell grammar admits neither `openssl` nor a
bare `mkdir` of that shape. In one dispatch the Critic improvised a `sed` read of `/dev/urandom` started in the
background; it never terminated, held a CPU core, and the Critic's grammar admits no kill, so the dispatcher had to stop
it. In a second dispatch the notes write itself was refused (`GUARD-DEVPLAN-SHELL`). Both Critics therefore reported
"persistence unavailable", which is the gap already filed as
`backlog/items/2026-08-27-critic-dispatches-cannot-persist-their-scratch-notes.md`; this item adds the randomness
instruction and the runaway-process hazard it invites.

#### Triggering situation

Critic records `specs/sprint-alfred-epic/evidence/critic-2026-10-05/gpgl-5-6-delta.md` (operational incident) and
`specs/sprint-alfred-epic/evidence/critic-2026-10-05/fanout-bundle-remainder.md` (persistence unavailable).

#### Affected artifact

`templates/prompts/critic-review.md` (and its vendored copy under `plugins/pipeline-core/templates/prompts/`),
`plugins/pipeline-core/agents/critic.md`, the shell grammar in `templates/prompts/agent-obligations.md`.

#### Proposal

Give the Critic one admitted, bounded route that creates its own fresh scratch subdirectory and writes
`critic-notes.md` inside it (a plugin script that draws the suffix with `node:crypto`, creates the directory
atomically, and appends notes), and replace the `openssl` example in the template with that script. Until then, the
template should say plainly that a Critic without that route reports persistence as unavailable and must not
improvise a randomness source.

#### Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:** fixed in source — closes after the 0.7.0 candidate host checklist (status stays `open` until then).
- **Rationale:** commit(s) `f95fc6998`.
- **Assignment (if accepted):** sprint-alfred-epic close-out batch.
- **Date:** 2026-10-08.

#### Verification 2026-10-22: the pin the item asked for

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

### Blocker analysis 2026-10-22

Read-only survey of the open clauses that the delivery remeasure assigned to native-host, verify-wsl, po-decision or po-signature (evidence: `specs/sprint-alfred-epic/evidence/blocker-analysis-2026-10-22/`). Status key: LINUX-RUN and WINDOWS-INTEROP-RUN are runs an agent can do from the WSL host; HOST-SESSION-NEEDED, PO-DECISION and PO-SIGNATURE are not agent work.

- **HOST-SESSION-NEEDED** — The live check that an installed Critic dispatch persists its notes is still open; the native Windows run of the pin is also missing
  Live part: a real Critic dispatch on an installed Claude host must write critic-notes.md through the guard-allocated Write/Edit route (model turn, no agent may drive it). The native pin lib/pins/critic-scratch-notes-write-is-refused-again.test.mjs could be run through Windows interop (WINDOWS-INTEROP-RUN, minutes), but that only closes the second half.
