---
schema: pipeline.backlog-item.v1
id: pipeline.onboarding-continuity-assumes-calibration-handover-is-always-a-plain-string
type: defect
owner: pipeline
status: open
created: 2026-08-18
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
