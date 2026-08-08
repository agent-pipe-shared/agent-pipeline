---
schema: pipeline.backlog-item.v1
id: pipeline.no-sanctioned-way-to-start-over
type: defect
owner: pipeline
status: open
created: 2026-08-08
due: 2026-08-15
source: "PO, 2026-08-08, unhappy-path transcripts from fresh Claude and Codex sessions on greenfield projects against the 0.5.4 local candidate. The Claude session composed a destructive `rm -rf` for the human to run, because no typed reset exists; the Codex session asked the human for permission to repair the Pipeline by hand."
---

# A project that gets stuck has no sanctioned way to start over, so an agent invents one

## The instruction an agent composed, verbatim in shape

```
rm -rf <project>/.git/agent-pipeline <project>/.claude <project>/.codex \
       <project>/docs <project>/pipeline.user.yaml
```

The agent proposed this to the human because there was no typed alternative, and
the human ran it. Read the fourth path again: **`docs/`**. It is in the list
because the Pipeline seeds its handover file at `docs/state.md`
(`plugins/pipeline-core/lib/onboarding-continuity.mjs:479`). In this test project
`docs/` held nothing else. In an adopted project it holds the adopter's
documentation, and the same reasoning produces the same command.

That is the finding, and it stands independently of every other item filed today:
**a state whose only exit is an agent-composed `rm -rf` is a missing command, not
an operator error.** No amount of agent discipline fixes it, because the agent
did the honest thing — it stopped, explained, and asked a human to act.

## Three separate absences produce it

**1. There is no reset.** Nothing in the plugin removes a project's Pipeline
state and returns it to a pre-onboarding condition. The pieces are known
(`.git/agent-pipeline/`, the compiled runtime configs, the seeded calibration,
the seeded handover), but no command owns the set, so each agent re-derives it —
and a re-derived list is exactly where `docs/` gets swept in whole rather than
one file.

**2. There is no way to discard a feature that was never implemented.**
`set-feature` refuses while an active continuity exists. `close-feature` is the
full closure ceremony — result artifact, HISTORY entry, retrospective, commit —
which the observed session correctly declined to perform for a feature with zero
lines of code, on the ground that it would fabricate a record of work that never
happened. Between "you may not point the feature elsewhere" and "you must
ceremonially close it" there is nothing, and the gap is exactly where a stuck
greenfield project sits.

**3. There is no clean second attempt at kickoff.** After the reset, the previous
kickoff anchor still blocked, and deleting it was itself refused in the
`kickoff-required` state. The session got past this by changing the project goal
line slightly, because the anchor directory is derived from that line's hash — a
different line yields a different directory. It worked, it is not a path, and it
leaves the old anchor behind as litter that the next attempt will trip over
again.

## What a fix must not become

A typed `reset` that deletes `docs/` is not an improvement over an untyped one.
The Pipeline seeds exactly one file there; a reset removes that file, never the
directory. The same rule applies wherever the Pipeline writes into a directory it
does not own: **remove what was seeded, by name, never the container.**

More generally, the observed command is a good specification of the danger to
design against — it was composed by a careful agent acting in good faith, and it
was still destructive, because deriving a delete-list from memory under pressure
is the failure mode. The typed command exists to make the list a reviewed
artifact rather than a recalled one.

## Direction, not a design

1. **A typed reset with a plan/apply pair**, like every other consequential
   operation here: `plan` prints the exact paths it will remove and the exact
   files it will leave, `apply` is digest-bound to that plan. It removes seeded
   files by name and never a directory it did not create.
2. **A discard path for an unimplemented feature** — the cheap counterpart to
   `close-feature`, which records that the feature was abandoned before
   implementation rather than manufacturing a closure record. The distinction is
   honest and it is also what makes the ceremony refusable without a dead end.
3. **A sanctioned second kickoff** that retires or replaces the previous anchor,
   rather than an agent dodging it through a hash-different goal line. Whatever
   the mechanism, the litter left by a failed first attempt is the reset's
   responsibility, not the next attempt's.
4. **State plainly, wherever the reset is documented, what it does not touch:**
   the repository's own git history, the adopter's files, and any design package
   under `specs/`. The observed session got this right by instinct and said so;
   the command should say it, not the agent.

## Related

- `2026-08-08-a-promotion-freezes-a-prd-the-po-gate-will-reject.md`
- `2026-08-08-a-permitted-edit-drops-the-session-into-an-unrecoverable-readiness-class.md`
- `2026-08-08-no-governed-directory-contract-so-every-session-invents-one.md` —
  the same shape one level up: absent a named place, each session invents one.
  Here, absent a named command, each session invents one.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:**
- **Rationale:**
- **Assignment (if accepted):**
- **Date:**
