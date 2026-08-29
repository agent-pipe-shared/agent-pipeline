---
schema: pipeline.backlog-item.v1
id: pipeline.codex-restart-context-loss-needs-a-different-approach
type: defect
owner: pipeline
status: open
created: 2026-08-29
sprint: nova
tracking: "NOW / Nova A -- PO explicitly elevated this 2026-08-29, live: 'was echt ein riesen thema ist, sind die fehlenden codex übergaben. Da braucht es eine ganz andere idee mal als ansatz bzw. härtere durchsetzung mit dem hint - das kann codex so einfach nie sauber verarbeiten' (this is a genuinely huge topic; needs a completely different approach, or harder enforcement -- Codex apparently can never cleanly process the current mechanism this simply)."
source: "PO inline observation #2 (2026-08-29 greenfield synthesis: 'Codex STILL (5 fix rounds over 3 weeks!) doesn't carry inputs/data across a restart'); Codex 060-77 retrospective section 'Informationsverlust beim Wiederanlauf'; supersedes 2026-08-09-codex-restart-cannot-recover-operational-context-from-its-own-prior-transcript.md and 2026-08-29-mechanical-proof-of-complete-prior-input-consumption-across-restart.md (both closed, both via code-reading/unit-test verification only -- neither live-verified against a real Codex restart, per this session's own now-repeated 'closed via code-reading, still broken live' failure pattern)."
---

# Codex restart context loss: closed twice on code evidence, still reported broken live after 5 fix rounds over 3 weeks -- needs a different approach, not another wiring pass

## What happened

Two backlog items already targeted this exact symptom class and were both
closed on code/test evidence:

- `2026-08-09-codex-restart-cannot-recover-operational-context-from-its-own-prior-transcript.md`
  (closed 2026-08-19) -- an instruction hook telling Codex to read its own
  prior transcript, wired and unit-tested.
- `2026-08-29-mechanical-proof-of-complete-prior-input-consumption-across-restart.md`
  (closed same day) -- the `resume-hint.mjs` `materialInput` mechanism
  (verbatim design-input capture across restarts), confirmed by static
  reading to exist and be runner-neutral.

The PO's own count: **5 fix rounds over 3 weeks**, and the problem is STILL
live -- reconfirmed by the Codex 060-77 greenfield retrospective the same
day these items were (re-)closed: "Der Resume-Hinweis war gegenüber dem
früheren Designinput deutlich verdichtet. Dadurch wurden zunächst generische
Zusatzfragen gestellt, obwohl die detaillierten Anforderungen bereits im
Gesprächskontext vorhanden waren." A prior investigation this session found
`resume-hint.mjs` grepped for "codex"/"Codex" with NO hits -- the mechanism
is generic/runner-neutral, which means either the Codex bootstrap path never
actually calls `resume-hint.mjs capture`/`inspect` at all, or it does and
the consumption step (reading `materialInput` back at the START of the next
session, per this repo's own MUST-DO consumption duty) is not actually
happening in the Codex adapter's own restart flow.

## Why this needs a different approach, per the PO's own explicit framing

The PO's instruction is explicit: **not** "harden the existing wiring
again" as the default next move -- five rounds of exactly that have not
held. The PO asks for either (a) a genuinely different mechanism, or (b) a
much harder technical enforcement with a strong hint, given their own
assessment that "Codex kann das so einfach nie sauber verarbeiten"
(Codex can apparently never cleanly process this the simple way). Read as
a request to question the mechanism's fit for Codex specifically, not just
its implementation.

## Direction (not prescriptive -- the PO wants a real design pass, not a patch)

1. Before proposing anything: get a genuine Codex-side root cause. Does the
   Codex bootstrap/session-restart path actually invoke `resume-hint.mjs`
   at all? If yes, at what turn, and does the MUST-DO consumption step
   (reading `materialInput` back and incorporating it before the bootstrap
   confirmation line) actually run, or is it silently skipped/failing?
2. Consider whether Codex's own session/restart model (distinct from Claude
   Code's) structurally cannot rely on the SAME mechanism Claude Code uses
   -- e.g. if Codex's restart genuinely starts from a smaller/different
   context envelope than Claude Code's, a Claude-shaped fix may be the
   wrong shape entirely for this runner.
3. "Härtere Durchsetzung" (harder enforcement) as an explicit alternative:
   rather than relying on the agent to read and apply a resume hint, could
   the harness/driver ITSELF refuse to proceed past the first design
   question until it has mechanically confirmed the prior material input
   was read (not just present) -- shifting from "the agent should read this"
   to "the session cannot advance without proving it did"?

## Acceptance criteria

- A live reproduction against a real Codex restart (not code-reading)
  confirms whether the mechanism fires at all for this runner.
- Whatever direction is chosen, it is proven against that live reproduction,
  not against unit tests alone -- this item's own history is the argument
  for why unit-test-only verification is not sufficient here.
- The fix, once verified, becomes permanent regression coverage exercising
  the ACTUAL Codex restart path, not a generic runner-neutral stand-in.

## Root cause found, 2026-08-29 (Elephant, live code tracing -- not closing the item)

Traced the actual invocation graph rather than re-reading the same files that
produced the two prior (still-wrong) closures. Findings, each confirmed by
reading the exact line, not inferred:

1. **The mechanical delivery point exists and does fire for Codex.**
   `hooks/codex-session-start-hint.mjs` is wired into `codex-hooks.json`'s
   `SessionStart` matcher (`startup|resume|clear`) and injects text into the
   session's context UNBIDDEN via `hookSpecificOutput.additionalContext` --
   confirmed by its own NVA-BL-72 comment: "the one place in this codebase
   that delivers text INTO a session's context unbidden... the strongest
   available meaning of 'mandatory' here, since no code can force an LLM to
   attend to a field it was merely permitted to fetch." So question 1 from
   this item's own Direction section is answered: yes, the bootstrap path
   invokes it, on every startup/resume/clear, mechanically.
2. **But it only surfaces the DISTILLED resume-hint card, never the verbatim
   `materialInput`/answered `values`.** Its `resumeHintContextLines()` calls
   `lib/resume-hint.mjs`'s `inspectResumeHint()` directly and destructures
   only `{ intent, scope, constraints, questions, progress }` from
   `hint.context`. `materialInput` (the user's own verbatim design input,
   captured specifically to survive a restart per SKILL.md step 6) and
   `values` (already-answered onboarding input) are never read or emitted --
   confirmed by `grep -rln materialInput plugins/pipeline-core/hooks` finding
   ZERO hook files, including this one.
3. **A fix for exactly this gap already exists -- on a DIFFERENT code path
   that the mechanical hook never reuses.** `scripts/resume-hint.mjs`'s CLI
   `inspect` command (NOT the library function of the same underlying data)
   was already extended (marker `NVA-RESUMEVERBATIM-1`) to read
   `readOnboardingIntakeCheckpoint()`/`readOnboardingIntakeMaterialInput()`
   from `lib/onboarding-continuity.mjs` and merge `intakeCheckpoint.values`/
   `intakeCheckpoint.materialInput` into its JSON output, with the explicit
   stated intent "surfaced here so the ONE existing MUST-DO consumption step
   (SKILL.md step 6) reads both in the same turn, instead of the runner
   re-asking a value the checkpoint already answered." That fix landed for
   the MANUAL path (an agent choosing to run `resume-hint.mjs inspect` and
   read its JSON) but was never propagated to `codex-session-start-hint.mjs`,
   the one path that does not depend on the agent choosing to do anything.
4. **This precisely explains the PO's own symptom description** ("Der
   Resume-Hinweis war gegenüber dem früheren Designinput deutlich
   verdichtet" -- the resume hint was noticeably condensed vs. the earlier
   design input): the mechanically-injected context structurally CANNOT
   contain the verbatim design input, because the one hook that injects
   content unbidden was never wired to the storage location that fix
   NVA-RESUMEVERBATIM-1 added.
5. **Claude Code has no equivalent mechanical hook at all** --
   `hooks.json` wires no session-start-hint-shaped hook comparable to
   `codex-session-start-hint.mjs`; `post-compact-reground.mjs` is `compact`-
   matcher only, not `startup|resume|clear`. Whether Claude Code's own
   restart flow needs the same mechanical treatment is a SEPARATE, larger
   question (a new TP-4-protected `hooks.json` entry) -- filed as its own
   item, not bundled into this fix, since the PO's own escalation was
   Codex-specific ("das kann codex so einfach nie sauber verarbeiten").

This is a scoped, mechanically-verified defect with a narrow, testable fix
shape (extend `resumeHintContextLines()` in `codex-session-start-hint.mjs`
to also read and surface `readOnboardingIntakeCheckpoint()`/
`readOnboardingIntakeMaterialInput()`, mirroring what NVA-RESUMEVERBATIM-1
already did for the CLI path) -- dispatched as NVA-CF-RESUMEVERBATIM-HOOK.
**This does NOT by itself satisfy this item's acceptance criteria** -- a
literal live Codex-CLI-restart reproduction is still outside what a
Claude-Code-hosted session can execute directly; the fix is proven via the
hook's own unit-test contract (its stdout `additionalContext` actually
contains the materialInput/values text for a fixture card), which is real
mechanical proof of the injection but not a substitute for an actual live
Codex restart. That gap is recorded on the PO decisions list.

**Landed, 2026-08-29:** commit `567be680`, independently re-verified by the
Elephant (`codex-session-start-hint.test.mjs` 48/48 pass). **Item stays
OPEN** -- per this item's own history (2 prior wrong closures on
code-reading/unit-test evidence alone), do not close this until an actual
live Codex CLI restart against this fix confirms the materialInput/values
text really arrives in a real Codex session's context, not only in the
hook's own unit-test harness.

## Triage

- **Decision:** accepted, Nova A, PO-elevated priority ("riesen Thema")
- **Rationale:** live, explicit PO escalation 2026-08-29; 4th recurrence this
  session of the "closed via code-reading, still broken live" pattern.
- **Date:** 2026-08-29

## Related

- `2026-08-09-codex-restart-cannot-recover-operational-context-from-its-own-prior-transcript.md`
  (closed) -- first attempt, superseded.
- `2026-08-29-mechanical-proof-of-complete-prior-input-consumption-across-restart.md`
  (closed) -- second attempt, superseded.
- `2026-08-29-codex-worker-subagent-dispatch-capability-is-broken.md` (open,
  Nova B) -- a second, separate Codex-runner-specific structural gap found
  the same session; may share a root cause worth investigating together
  (both are "Codex's own session/runtime model behaves differently than
  assumed").
