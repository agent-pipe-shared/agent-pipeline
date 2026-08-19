---
schema: pipeline.backlog-item.v1
id: pipeline.codex-runner-has-no-real-support-on-native-windows
type: defect
owner: pipeline
status: open
created: 2026-08-19
source: "Live external greenfield test, 2026-08-19: project Rune_Test1_Codex_060_55, Windows host, Codex CLI, candidate 0.6.0+codex.20260819163512.ca18e0c. PO pasted the full session transcript; a companion fix (NVA-BL-CASWIN-1, scoped narrowly to the self-contradicting recovery message) was dispatched the same session. This item is the PO's own explicitly deferred second half: \"Für einen späteren sprint bzw. defered ein neues backlog item setzen, dass codex windows support noch gebaut werden muss.\""
---

# Codex runner has no real support on native Windows — app-server is required unconditionally, and nothing here documents the gap

## Description

A PO running Codex CLI natively on Windows (not WSL) hit a hard bootstrap
block: `project-onboarding-v3.mjs`'s Codex-runner bootstrap/session/dispatch
path requires a successful App-Server health observation before it will
report ready (`project-onboarding-v3.mjs` ~line 2369's own comment: "Runtime
projection and App-Server health are distinct authorities... requires the
same single, read-only App-Server observation ... before bootstrap, session,
or dispatch may report ready"). The Codex CLI's own app-server daemon
lifecycle (`codex app-server daemon restart` etc.) is Unix-only — it cannot
exist on native Windows at all, confirmed directly from the CLI's own stderr
in the live transcript: `"Error: codex app-server daemon lifecycle is only
supported on Unix platforms"`.

A same-session companion fix (`NVA-BL-CASWIN-1`) closes the immediate,
narrow symptom: the health-check script no longer tells a Windows human to
run a command that can never work there, and instead reports plainly that
app-server is unsupported on this platform and WSL is required. That fix is
deliberately narrow and does not touch the actual architecture problem this
item tracks.

## The actual gap

App-server's real, and apparently *only*, production consumer is the
Advisor one-turn model-consultation capability
(`plugins/pipeline-core/scripts/codex-advisory-app-server.mjs`) — no other
call site was found in a same-session investigation. Yet app-server
readiness is gated onto **every** Codex `session`/`bootstrap`/`dispatch`
intent unconditionally, regardless of whether that session ever uses
Advisor. The practical effect: a Windows Codex user cannot get past
bootstrap at all today, even for ordinary implementation work that never
touches Advisor — not because their actual task needs an unavailable
capability, but because an unrelated capability's readiness check is
wired as a hard global gate.

`docs/runner-support.md` currently has **zero** mentions of "app-server" or
"Windows" — this gap is undocumented anywhere in the repo's own
platform-support scope claims, so a reader has no way to discover the
limitation short of hitting it live, as this PO did.

## Triggering situation

Live external greenfield test, 2026-08-19, Windows host, Codex CLI, this
session's own candidate `0.6.0+codex.20260819163512.ca18e0c`. Full session
transcript pasted by the PO in chat (not reproduced verbatim here — see the
session's own conversation history for the exact commands/output if a full
repro trace is needed later).

## Affected artifact

`plugins/pipeline-core/lib/codex-onboarding-app-server.mjs`
(`observeOnboardingAppServer()`, the function deciding which intents require
app-server), `plugins/pipeline-core/scripts/project-onboarding-v3.mjs` (the
bootstrap/session/dispatch readiness gate that consumes that observation),
`plugins/pipeline-core/scripts/codex-advisory-app-server.mjs` (app-server's
actual consumer), `docs/runner-support.md` (the documented platform-support
scope this gap is currently absent from).

## Proposal

Not designed here — this is architecture/design-latitude work, correctly
out of scope for the same-session narrow companion fix. Directions worth
weighing by whoever picks this up:

1. **Make app-server readiness capability-scoped, not intent-scoped.**
   `observeOnboardingAppServer()` currently keys on *intent*
   (`session`/`bootstrap`/`dispatch` vs. `onboarding`). Consider keying on
   whether the actual session/task will invoke Advisor at all — a Windows
   Codex user who never touches Advisor would then bootstrap cleanly, and
   only a genuine Advisor invocation would need to fail closed (with the
   same clear "use WSL" message `NVA-BL-CASWIN-1` already built for the
   health-check layer).
2. **Or: build real native-Windows app-server support**, if the Codex CLI
   itself gains it upstream, or if a Windows-native equivalent mechanism
   exists that this pipeline could adopt — track upstream Codex CLI
   Windows app-server support as an external dependency, not something
   this repo can build alone if the CLI genuinely has no Windows daemon
   lifecycle at all.
3. **Document the gap explicitly** in `docs/runner-support.md` regardless
   of which direction above is chosen — add a Windows-native/Codex row or
   section stating the current limitation and the WSL workaround, so the
   next Windows Codex adopter learns this from documentation rather than a
   live failed bootstrap.
4. **Existing precedent to reuse, not reinvent:**
   `plugins/pipeline-core/lib/session-power.mjs` already has a typed
   `platform-unsupported` failure class (`UNAVAILABLE_FAILURES`, ~line 38)
   and explicit `process.platform` branching (`fixedAdapterLaunch()`,
   ~lines 447-474) for exactly this "Unix-only capability, degrade
   gracefully on Windows" shape — any design here should follow that
   established pattern, not invent a new one.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:** deferred, per explicit PO instruction (2026-08-19, verbatim
  from the same session that surfaced this live): "Für einen späteren
  sprint bzw. defered ein neues backlog item setzen, dass codex windows
  support noch gebaut werden muss." The PO explicitly split this into two
  pieces in the same message — a short-term mitigation (done same session
  as `NVA-BL-CASWIN-1`) and this longer-term architecture item, deliberately
  not actioned now.
- **Rationale:** the PO's own framing distinguishes "quick fix now" from
  "real support, later sprint" — this item preserves that split rather than
  either closing prematurely (the real gap is unaddressed) or forcing an
  architecture decision (which intents actually need app-server) into the
  same dispatch as the narrow symptom fix.
- **Assignment (if accepted):** a future sprint, not named here — the PO's
  own message did not commit to a specific sprint, only "später" (later).
  Whoever picks this up should re-verify `NVA-BL-CASWIN-1`'s landed state
  first (confirm the companion fix is still in place and matches this
  item's own "Affected artifact" description) before designing further.
- **Date:** 2026-08-19
