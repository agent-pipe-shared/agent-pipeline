---
schema: pipeline.backlog-item.v1
id: pipeline.guard-lifecycle-ready-rejects-plan-runtime-intent-argv
type: defect
owner: pipeline
status: open
created: 2026-08-07
source: "Live onboarding test (rune_test1_claude line of work) hitting a self-inflicted guard rejection at the plan-runtime step, 2026-08-07 (Nova GMW session); root cause independently re-verified by reading the cited source directly, not taken from the report alone."
due: 2026-09-06
expires: 2026-09-06
---

# `guard-lifecycle-ready.mjs` rejects the Pipeline's own `plan-runtime`/`plan-repair`/etc. `nextAction` whenever `intent` is not `"onboarding"`

## Description

The onboarding lifecycle's own suggested `nextAction` for the
`plan-runtime`/`plan-repair` step can carry a `--intent <value>` flag
(added by the `c860e1d` runner-identity-threading fix, see
[`2026-08-06-onboarding-lifecycle-plan-hardcodes-the-codex-runner.md`](2026-08-06-onboarding-lifecycle-plan-hardcodes-the-codex-runner.md)),
but `guard-lifecycle-ready.mjs`'s sanctioned-command allowlist for the
`plan`/`plan-runtime`/`plan-reinstall`/`plan-repair`/`plan-readback`/
`plan-source-recovery`/`plan-manifest-repair` family never accepts an
`--intent` flag at all, regardless of position. Whenever `intent` is
`"session"`, `"bootstrap"`, or `"dispatch"` (i.e. anything but the default
`"onboarding"`), following the tool's own returned command verbatim is
refused by its own guard as "not sanctioned" — the exact failure mode the
`withoutRunnerFlag` helper's own header comment already names and was
previously fixed for `--runner` alone: "the guard refused the
identity-carrying command ... and the refusal it printed named a command it
would itself deny." This is a recurrence of that same defect class, on the
`--intent` flag this time, introduced by the fix that closed the `--runner`
half.

## Triggering situation

Reported by a second `rune_test1_claude` onboarding-test session, 2026-08-07,
alongside the evidence for
[`2026-08-07-onboarding-restart-flow-is-codex-only-not-runner-aware.md`](2026-08-07-onboarding-restart-flow-is-codex-only-not-runner-aware.md).
Independently re-verified in the Nova GMW session by reading the cited source
directly against current HEAD (not taken from the report alone):

- `plugins/pipeline-core/lib/project-onboarding-v3.mjs:1300-1303`,
  `lifecycleArgv(argv, runner, intent = "onboarding")`: appends `--runner
  <runner>` always, and additionally `--intent <intent>` whenever `intent !==
  "onboarding"`.
- `plugins/pipeline-core/lib/project-onboarding-v3.mjs:2851`, the
  `plan-runtime`/`plan-repair` `nextAction` construction, calls
  `lifecycleArgv([ONBOARDING_SCRIPT, initialize ? "plan-runtime" :
  "plan-repair", "--root", legacy.root], runner, intent)` — `intent` here is
  threaded from the caller and is `"session"` for an ordinary mid-session
  lifecycle re-check (not just first-time `"onboarding"`/`"bootstrap"`),
  making this a routine, not exotic, path.
- `plugins/pipeline-core/hooks/guard-lifecycle-ready.mjs:593-598`,
  `withoutRunnerFlag(args)`, strips only a *trailing* `--runner
  <claude|codex>` pair before the shape checks run.
- `plugins/pipeline-core/hooks/guard-lifecycle-ready.mjs:600-628`,
  `sanctionedOnboardingArgs`: the `inspect` branch (line 602-606) explicitly
  supports an `--intent` 5-token form; the `plan`/`plan-runtime`/
  `plan-reinstall`/`plan-repair`/`plan-readback`/`plan-source-recovery`/
  `plan-manifest-repair` branch (line 609-610) requires `args.length === 3`
  exactly, after the runner strip, with no `--intent` provision at all.

Concretely: a suggested command `plan-runtime --root <root> --runner claude
--intent session` is refused, because (a) `--runner claude` is not the
trailing pair (so `withoutRunnerFlag` does nothing), and (b) even a
`plan-runtime --root <root> --intent session` form with the runner already
stripped would still fail, since the branch has no `--intent` support at any
length. The one command shape that *is* accepted —
`plan-runtime --root <root> --runner claude` (dropping `--intent`
entirely) — was found only by manually deviating from the tool's own
returned `nextAction`, not by following it.

## Affected artifact

- `plugins/pipeline-core/hooks/guard-lifecycle-ready.mjs` —
  `sanctionedOnboardingArgs`, the `plan*` branch (line 609-612).
- `plugins/pipeline-core/lib/project-onboarding-v3.mjs` — `lifecycleArgv`
  (source of the `--intent` flag) and its `plan-runtime`/`plan-repair` call
  site (line 2851); likely other `plan*` call sites carry the same shape and
  were not individually re-audited here.
- Regression coverage gap: `onboarding-runner-identity.test.mjs`
  (ORI01–ORI05, cited as the `c860e1d` fix's own regression suite) evidently
  did not exercise the returned `nextAction.argv` against the guard's own
  allowlist, or this would have been caught before it reached a live session
  — not independently confirmed here, flagged for the fix session to check.

## Proposal

**Corrected 2026-08-07** (a first dispatch, NOVA-LCR-INTENT-1, correctly
stopped rather than implement this section's original text verbatim — see
below): the original proposal below assumed `withoutRunnerFlag`'s existing
trailing-pair-only strip already normalizes a `--runner`-then-`--intent`
argv down to `[cmd, "--root", root, "--intent", intent]` before the `plan*`
shape check runs. It does not. `lifecycleArgv(argv, runner, intent)` always
appends `--runner <runner>` first, then `--intent <intent>` afterward
whenever `intent !== "onboarding"` — so `--intent` is the trailing pair, not
`--runner`, and `withoutRunnerFlag`'s trailing-only check does nothing for
this shape. The array `sanctionedOnboardingArgs` actually receives for e.g.
`plan-runtime --root <root> --runner claude --intent session` is the full
7-token `[cmd, "--root", root, "--runner", "claude", "--intent", "session"]`,
never the 5-token form this section originally described.

Corrected fix shape: generalize `withoutRunnerFlag` from a trailing-pair-only
strip to a scan-and-remove of the first `--runner <claude|codex>` pair
found anywhere in the array (not only at the end), before any shape check
runs. `lifecycleArgv`'s own construction is deterministic — `--runner` is
always either the trailing pair (default intent) or the second-to-last pair
(non-default intent, with `--intent` trailing) — so a scan-and-remove
strip correctly normalizes both cases to a clean `[cmd, "--root", root]` or
`[cmd, "--root", root, "--intent", intent]` shape, and the `plan*` branch
can then mirror the `inspect` branch's existing optional-`--intent` pattern
literally, exactly as this section originally intended. This is the more
robust fix (closes the actual fragility class future flag additions would
otherwise re-trigger) rather than a shape-specific patch for this one
argv ordering. Verify no regression across every other branch that calls
`withoutRunnerFlag` (`inspect`, `continuity inspect`, `apply-manifest-repair`,
`apply-*`, `kickoff plan`/`apply`) via the full existing
`guard-lifecycle-ready.test.mjs` suite, since the strip is now less
positionally strict than before.

Add a guard-side regression test that constructs the exact `nextAction.argv`
`lifecycleArgv` would emit for each non-default intent (the real 7-token
shape, not the originally-assumed 5-token one) and asserts the guard accepts
it — closing the gap the existing regression suite apparently missed. Small,
bounded, hook-tier change (guard/canon code per this repo's own dispatch
tiering) — needs a Goldfish-deep + Critic round, not a same-session hotfix,
consistent with the sibling restart-runner items.

**Separately noted, out of this item's scope:** NOVA-LCR-INTENT-1 also found
`sanctionedOnboardingArgs` lines 611-612 (`["plan-source-recovery",
"plan-manifest-repair"]` with an identical `args.length === 3` check) are
fully subsumed by line 609's broader list check and are dead code —
pre-existing, harmless, not part of this defect; left untouched, flagged here
for a future cleanup pass.

## Triage (filled in by the Elephant of the next Pipeline session)
