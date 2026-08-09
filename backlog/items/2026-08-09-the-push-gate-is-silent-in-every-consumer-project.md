---
schema: pipeline.backlog-item.v1
id: pipeline.push-gate-is-silent-in-every-consumer-project
type: defect
owner: pipeline
status: open
created: 2026-08-09
source: "Found by the PO while reviewing the Codex greenfield run of 2026-08-09: the agent pushed to a GitHub remote and no approval, verify evidence or security evidence was ever demanded."
due: 2026-08-10
---

# The push gate is configured, projected away, and therefore silent in every consumer project

## What happens

A seeded consumer project gets a calibration that promises three gates and a
manifest that carries one. `guard-push.mjs` reads the manifest.

| File | `gates` content |
|---|---|
| `pipeline.user.yaml` (calibration, what the human configures and reads) | `dev_plan: blocking`, **`push: blocking`**, **`security: warn`** |
| `project/pipeline.yaml` (the manifest `guard-push.mjs` actually consults) | `dev-plan` only |

`guard-push.mjs`'s own order of evaluation, step 4: *"Gate `push` absent, or
`mode === "off"` → exit 0."* So the gate does not fail, does not warn, and does
not appear — it is simply not there.

## What that cost, measured

In the PO's 2026-08-09 Codex greenfield run the agent ran
`git push -u origin rune_test1_codex_054_33` and it succeeded. Nothing asked for:

- a recorded push approval (`pipeline-state.mjs approve-push`),
- `evidence/verify-latest.json` bound to the pushed commit,
- `evidence/security-latest.json` (the calibration says `security: warn`),
- the critical-human-proof check that `gates.push_approval` governs.

`gates.push_approval` is absent from the consumer calibration entirely, so it
resolves to its safe default `signature` — and that default was never reached,
because evaluation stopped four steps earlier.

The manifest names itself "Generated V3 Claude compatibility projection", so a
generator produces it and carries `dev-plan` across while dropping `push` and
`security`. The projection, not the calibration, is what enforcement sees.

## Confirmed independently by the second runner, which rules out the easy explanation

The Claude greenfield run of the same day reached the same wall and diagnosed it
in its own transcript:

> `git push` lief aber ohne jede Prüfung durch. Kein `guard-git`-Eingriff, kein
> Approval-Record … Bei den Commit-Trailern hatte derselbe Guard sauber
> zugeschlagen (GIT-03), das Gate offenbar nicht. **Der Hook ist nicht tot.**

That last sentence closes the obvious alternative: the hook family is wired and
firing — GIT-03 refused a commit trailer in the same session — so this is not an
uninstalled guard. It is `guard-push` reaching step 4 and exiting 0 because the
manifest has no push gate.

**The aggravating half is the PO's own observation:** that session *knew* a
signature was required, said so, and pushed anyway, because nothing stopped it. A
gate an agent can name and then walk through is worse than an absent one — it
manufactures the appearance of control. The seed at
`project-onboarding-v3.mjs:752` is a hardcoded one-gate chapter
(`"  dev-plan:\n    mode: blocking\n    type: human\n"`), and the comment above it
records that this exact defect was already found once, for `dev_plan`, and closed
by hardcoding that one gate. `push` and `security` were not carried along.

## Why nothing caught it

The same shape this block has now hit six times: two artifacts each validated
against its own expectations and never against the other. The calibration is
schema-valid. The manifest is schema-valid. `guard-push` behaves exactly as
documented for a manifest without a push gate. Every part is correct and the
composition is unprotected — and unprotected is the *green* state, which is what
makes it quiet.

`2026-08-06-no-gate-is-tested-end-to-end-for-satisfiability.md` predicted this
class. This is its most expensive instance: not a gate that cannot be satisfied,
but a gate that cannot be reached.

## Affected artifacts

- `plugins/pipeline-core/hooks/guard-push.mjs` — step 4 of the evaluation order.
- Whatever generates `project/pipeline.yaml` during onboarding — it carries
  `gates.dev-plan` and drops `gates.push` / `gates.security`.
- `pipeline.user.yaml` seed — promises three gates.

## Direction

1. **First fact, established.** The generator is
   `plugins/pipeline-core/lib/runtime-projection-v3.mjs`. At `:178-180` it copies
   the calibration's `gates` object and deletes exactly one key,
   `push_approval`, with the reason that V2's closed gates key set would reject
   it. So the other gates are handed on rather than dropped there. But the
   calibration writes `dev_plan: "blocking"` (underscore, plain string) while the
   emitted manifest carries `dev-plan: {mode: blocking, type: human}` (hyphen,
   object) — a shape translation exists, and on this evidence it covers exactly
   one gate. Confirming which side drops `push` and `security` is one more read;
   the direction is not in doubt.
2. The projection must carry every gate the calibration declares, or the
   calibration must not declare gates the projection cannot express. Silently
   carrying one of three is the only outcome that must stop.
3. **A contract test that is the actual remedy for this class:** for each gate a
   calibration declares, assert the enforcing hook reaches its decision. Not "the
   manifest is valid" and not "the guard works" — that both artifacts agree about
   which gates exist. That test would have failed on the first seeded project.
4. Until fixed, a consumer must be told the push gate is inactive rather than
   left to infer it from a calibration that says `blocking`.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:**
- **Rationale:**
- **Assignment (if accepted):**
- **Date:**
