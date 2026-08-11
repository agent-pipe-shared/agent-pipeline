---
schema: pipeline.backlog-item.v1
id: pipeline.session-told-ready-but-not-how-to-repair
type: defect
owner: pipeline
status: closed
closed_at: 2026-08-11
closure_repository: self
closure_commit: 598601b441207f70da632a660fffe14a88c3ed67
closure_evidence: specs/sprint-nova-epic/evidence/backlog/2026-08-11-pareto-triage-report.md
created: 2026-08-08
due: 2026-08-15
source: "PO, 2026-08-08: 'einer frischen session fehlt scheinbar die info wie sie gates lifted und wie sie reparaturen macht ... das verschwendet total viele token'. Observed in both the Claude and the Codex greenfield transcripts against the 0.5.4 local candidate."
---

# The bootstrap tells a session it is ready, never what to do when it stops being ready

## The observation, with its cost

The bootstrap ends in a confirmation line stating readiness, authority, profile,
calibration, handover and Verify availability. It is a good line. It describes
one state — the good one — and says nothing about the others.

Both observed sessions then spent significant budget reconstructing the recovery
vocabulary from source when they left that state. The Claude session searched
fourteen patterns across five files and ran nine shell commands, and paused for
nineteen minutes of reasoning at one point, to work out what `PO-GATE-PRD-SPEC-MISMATCH`
wanted and whether any route out existed. The Codex session read
`pipeline-state.mjs` and `project-onboarding-v3.mjs` in slices — `rg` with wide
context windows, then `sed -n` over line ranges — probing five different
subcommands by running them with no arguments to make them print their own
requirements.

Reading the implementation to discover the interface is the behaviour to design
away. It is slow, it is expensive, and it produces confident wrong conclusions:
one session concluded the fix was to edit a bound document, the other concluded a
rebind must exist somewhere.

## What is missing is not documentation in general

`docs/push-release-flow.md` exists and is good, and CLAUDE.md points at it. The
gap is narrower and more specific: **a session that has just been refused does
not know whether the refusal is liftable, by whom, and with which command.**

The guard is not silent — several denial classes already return typed
`retryActions`, and the human-override route prints its exact three commands.
That machinery is the proof the shape is right; it simply does not cover the
classes these sessions hit. Where it covered them, both agents used it correctly
and without hunting. Where it did not, both went reading source.

Three concrete absences the transcripts show:

1. **No map from refusal class to who can clear it.** Some classes are
   agent-clearable through a typed action, some need a human signature, and some
   (readiness) are not liftable at all. That partition is knowable, it is stable,
   and it exists nowhere a session can read it in one step.
2. **The subcommand surface is discoverable only by failing.** `pipeline-state.mjs`
   with no arguments prints the full command list — which is how the Codex
   session found it — but no per-command usage without invoking it and reading
   the validation error. `--help` is refused as an unknown command.
3. **The bootstrap confirmation has no negative half.** It states what is ready.
   It could state, in one line, where to look when something stops being ready,
   at a cost of one line.

## Direction, not a design

1. **A repair map, one screen, addressed to an agent.** Refusal class → is it
   liftable → by whom → the exact command or the exact reason none exists. Its
   value is in being complete about the "no path exists" cases too: the observed
   sessions burned most of their budget proving a negative.
2. **Extend typed `retryActions` to the classes that lack them**, rather than
   documenting around the gap. A refusal that carries its own next action is
   strictly better than a refusal plus a document, and the mechanism is already
   built and in use.
3. **`--help` per subcommand.** Cheap, and it removes a whole class of
   invoke-to-discover probing. The current behaviour — `--help` rejected as an
   unknown command, with the full list printed as the error — is close enough
   that this is a small change.
4. **One line in the bootstrap confirmation** pointing at (1). Not a lecture:
   context economy is the reason the confirmation is short, and this must stay
   compatible with that.
5. **Measure it the way the transcripts did.** The success criterion is not "a
   document exists" but "a refused session reaches its next correct action
   without reading plugin source". Both transcripts are usable as before-cases.

## Related

- `2026-08-08-a-promotion-freezes-a-prd-the-po-gate-will-reject.md` — the refusal
  both sessions could not decode.
- `2026-08-08-there-is-no-sanctioned-way-to-start-over.md` — the case where the
  honest answer is "no path exists", which is exactly what a repair map must be
  able to say.
- `2026-08-08-an-installing-consumer-is-never-asked-any-setup-decision.md` — the
  same gap at install time rather than at repair time.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:** Closed (2026-08-11) — fixed.
- **Rationale:** the repair-map direction (1) was shipped as `scripts/repair-map.mjs`, a runtime query point separating never-liftable, never-liftable-by-policy, and author-repair-required refusal classes for an agent to consult instead of reading plugin source (`closure_commit` `598601b441207f70da632a660fffe14a88c3ed67`).
- **Assignment:** N/A — already closed.
- **Date:** 2026-08-11.
