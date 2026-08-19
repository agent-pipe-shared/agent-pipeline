---
schema: pipeline.backlog-item.v1
id: pipeline.onboarding-continuity-assumes-calibration-handover-is-always-a-plain-string
type: defect
owner: pipeline
status: closed
created: 2026-08-18
closed_at: 2026-08-19
closure_repository: self
closure_commit: 5e34c0b55321d2332eec641c1e881e6bd73fe5d3
closure_evidence: backlog/items/2026-08-18-onboarding-continuity-assumes-calibration-handover-is-always-a-plain-string.md
source: "Live incident, 2026-08-18, this session: setting project/pipeline.json's `handover` key to the ADR-0066-Decision-5-sanctioned `{ path, maxBytes }` object shape (already fully supported by handover-rotate.mjs/lib/handover-rotation.mjs) dropped the session into an unrecoverable continuity-observation-unavailable readiness class, blocking every Edit/Write/mutating-Bash tool call. Recovered only via an out-of-session `! git checkout -- project/pipeline.json` run by the PO directly (bypassing the tool-call hook chain), since even the guard's own suggested recovery command was itself blocked by the same gate."
---

# `onboarding-continuity.mjs` still assumes `calibration.handover` is always a plain string, unlike `handover-rotation.mjs`'s dual-shape support

## Description

ADR-0066 Decision 5 introduced a `handover.path` / `handover.maxBytes`
OBJECT shape for the `handover` key in project calibration
(`project/pipeline.json`), alongside the pre-existing plain-string shape.
`plugins/pipeline-core/lib/handover-rotation.mjs`'s `resolveHandoverConfig()`
already handles both shapes correctly (confirmed by direct read). But
`plugins/pipeline-core/lib/onboarding-continuity.mjs` — a DIFFERENT
module that also reads `calibration.handover`, used by the session
readiness/continuity classifier — was never updated for the new shape.
At least the call site around line 578 passes `calibration.handover`
directly into `safeRelativePath()`, which expects a string; several
other `handover`-adjacent call sites in the same file (see the many
`handover.path`/`handover.beforeSha256`/`handover.afterSha256` shapes
used elsewhere for kickoff/promotion targets, an unrelated but
similarly-named concept) may have the same or related assumptions and
were not individually audited during this incident — only the one
call site that actually broke was root-caused.

The practical effect, confirmed live: setting the calibration's
`handover` key to the sanctioned object shape causes
`classifyOnboardingContinuity()` (or whatever it calls internally) to
throw or otherwise fail to reach a `"valid"` continuity status, which
`project-onboarding-v3.mjs`'s lifecycle classification (~line 2293)
treats as a catch-all `continuity-observation-unavailable` readiness
class. That class has NO in-session recovery path today (a separate,
already-filed gap — see the related item below): every Edit, Write,
and non-diagnostic Bash tool call gets refused by
`guard-lifecycle-ready.mjs`, INCLUDING the guard's own suggested
recovery command (re-running the `project-onboarding-v3.mjs inspect`
CLI is itself a `node <script>` Bash invocation, which the guard's
read-only-diagnostic classifier does not recognize as safe, so it is
refused by the exact same gate it is meant to clear). The only
successful recovery path in this incident was the PO running
`git checkout -- project/pipeline.json` directly via the `!`-prefixed
terminal-passthrough (bypassing Claude Code's PreToolUse hook chain
entirely, since a user-typed `!` command is not a tool call this
session makes).

## Triggering situation

This session set `project/pipeline.json`'s `"handover": "docs/state.md"`
to `{ "path": "docs/state.md", "maxBytes": 30000 }` while trying to
raise the project's own handover size cap per a PO request. The edit
itself succeeded (Edit tool, before readiness degraded), but every
subsequent tool call of any mutating kind failed until the PO manually
reverted the file from outside the session. The PO then redirected the
underlying request toward raising the shared library default
(`HANDOVER_MAX_BYTES` in `lib/handover-rotation.mjs`) instead of a
per-project override, explicitly diagnosing this as unfinished
per-repo-configurability work ("ich glaube du bist da gerade in ein
thema gerannt was erst nightwing löst: konfigurierbar je repo").

## Affected artifact

`plugins/pipeline-core/lib/onboarding-continuity.mjs` (the
string-only `calibration.handover` read at ~line 578 and any sibling
call sites sharing the same assumption — needs a full audit, not just
the one confirmed-broken site). Related, but distinct, open items:
`pipeline.permitted-edit-drops-session-into-unrecoverable-readiness`
(the readiness class itself has no in-session recovery path — this
item is about ONE way to trigger that class, not about fixing the
class's own non-liftability). Also worth cross-referencing against
whatever Nightwing-scoped "per-repo configurable calibration" work the
PO was referring to, since this bug is a concrete instance of that
larger gap.

## Proposal

Not yet designed in detail. Likely direction: make
`onboarding-continuity.mjs`'s `calibration.handover` reads shape-aware
the same way `handover-rotation.mjs` already is (extract a small shared
helper both modules import, rather than duplicating the dual-shape
logic a second time — the exact class of drift ADR-0066's own
`bootstrap-payload-measure.test.mjs` single-owner pattern was built to
prevent for a different constant). Needs a regression test exercising
a `project/pipeline.json` with the object-shaped `handover` key through
whatever readiness/continuity path this file feeds, so this exact
incident cannot recur silently.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:** not yet decided — filed to preserve the finding.
- **Rationale:** real, live, session-stranding defect (confirmed by
  direct incident, not inferred), but the exact fix needs a proper
  audit of every `calibration.handover` call site in
  `onboarding-continuity.mjs`, not a rushed patch while recovering from
  the incident it caused.
- **Date:** 2026-08-18

### PO-decision implementation, 2026-08-18 (wave 3, dispatch NVA-W3-10)

**PO decision implemented:** decision #15, direction A — minimal
patch, changing ONLY the one root-caused call site in
`plugins/pipeline-core/lib/onboarding-continuity.mjs`, rather than a
full call-site audit across the file.

**What was changed:**

- `plugins/pipeline-core/lib/onboarding-continuity.mjs`, inside
  `observeDetailed()` (the function `classifyOnboardingContinuity()`
  calls internally — the exact site that stranded the session in this
  incident, ~line 588 after the edit, ~line 581 before it): the
  `calibration.handover` read now resolves the same dual shape
  `plugins/pipeline-core/lib/handover-rotation.mjs`'s
  `resolveHandoverConfig()` already supports — a plain string names
  the path directly (pre-ADR-0066 shape); an ADR-0066 Decision 5
  `{ path, maxBytes }` object names it via its `.path` field
  (`maxBytes` is not read at this call site, which never needed it).
  Anything else — including an object with no usable `.path` — still
  reaches `safeRelativePath()` and fails closed with
  `KICKOFF-PATH-UNSAFE`, exactly as before this fix; only the two
  sanctioned shapes are newly accepted.
- `plugins/pipeline-core/lib/onboarding-continuity.test.mjs`: added two
  regression checks next to the existing "custom configured handover"
  check — one confirming an object-shaped `{ path, maxBytes }` handover
  is now observed (`damaged` status, matching the plain-string
  equivalent, instead of throwing/`unavailable`), and one confirming an
  object without a usable `.path` still fails closed to `unavailable`
  (the pre-existing safety behavior is preserved, not loosened).

**Deviation (judgment call, not a re-decision):** the exact code
pattern the PO decision quotes verbatim
(`calibration.handover === undefined ? "docs/state.md" :
safeRelativePath(calibration.handover, ...)`) actually occurs at TWO
places in this file, byte-for-byte identical: the one above (inside
`observeDetailed()`, confirmed root cause of the live incident) and a
second one inside `syncStateMdNextAction()` (~line 3430). The decision
text names "the one call site" singular; this item's own "Affected
artifact" section also names only the ~line-578 site as the
confirmed-broken one, explicitly leaving siblings unaudited. I treated
the `observeDetailed()` site as the intended target (it is the one that
actually broke and stranded the session) and left
`syncStateMdNextAction()` untouched, per the decision's explicit
"rather than a full call-site audit across the codebase." Note for
whoever reviews this: `syncStateMdNextAction()`'s occurrence is wrapped
in a catch-all `try/catch` that falls back to `"docs/state.md"` on ANY
error, so an object-shaped `handover` there does NOT strand a session
the way the fixed site did — it silently resyncs the wrong (default)
file instead of the configured one. Different, milder symptom; still
the same underlying dual-shape gap. Left open for a possible follow-up
item if the PO wants that call site closed too.

**Evidence:** `node --test
plugins/pipeline-core/lib/onboarding-continuity.test.mjs` — 160/160
checks passed (158 pre-existing + 2 new), exit code 0.

**Closure:** left `status: open`. The confirmed-broken, session-
stranding call site is fixed and regression-tested per the PO's
explicit minimal-patch decision, but the sibling occurrence identified
above shares the same underlying dual-shape gap (milder symptom, not
audited or fixed here) and the decision text's own wording ("the one
call site") is ambiguous between the two byte-identical occurrences.
Leaving this open rather than guessing at closure, per the dispatch
briefing's own instruction to leave status as-is when unsure.

## Closure, 2026-08-19 (Wave 5 round 1, dispatch NVA-W5-03)

The sibling `syncStateMdNextAction()` call site named above as the
explicitly-unaudited milder-symptom gap is now fixed with the same
dual-shape resolution pattern, regression-tested
(`plugins/pipeline-core/lib/onboarding-continuity.test.mjs`, 163/163
pass, including the new object-shaped-handover case for this call
site). Both concretely identified call sites sharing this assumption
(`observeDetailed()`, fixed wave 3; `syncStateMdNextAction()`, fixed
here) are now resolved. The Description's caveat that "several other
handover-adjacent call sites ... may have the same or related
assumptions" was never narrowed to a second confirmed-broken site
beyond these two — closing on the two concretely identified and now
fixed sites, not on an unbounded audit claim.
