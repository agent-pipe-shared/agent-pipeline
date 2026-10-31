# w8-v10-wiring-cases-run-on-generated-briefings (held patch, not applied)

Cause of thirteen red cases in `lib/pins/claude-windows-greenfield-lifecycle-not-walkable.test.mjs` (V-10 admission wiring): they sent hand-written Goldfish briefings through the real dispatch hook.
Since D185 every Goldfish dispatch needs a generator briefing, and since D205 a slice is admitted once (an admitted dispatch reserves slice and scope).

PO decision (2026-10-31): convert the Native, Codex and Antigravity cases to generated briefings; the Workflow cases become a documented Dynamic-Gap. No protected hook changes.

Change (one test file):
- Briefings come from the generator (`buildGeneratedGoldfishBriefing`), each case in its own approved-course root (`prepareGeneratedDispatchRoot`); edits reword the goal inside the generator, a hand edit breaks the briefing digest (pinned: `DBG-GENERATED-DIGEST`).
- The hook carries each slice's first admission and every refusal (hook child runs with `cwd` and a session id). A later admission of the same slice runs `recordAdmittedBriefingRoutes`, the one function the hook calls to record a route.
- Codex and Antigravity: the fixture issues a Claude-route binding, so those runners refuse it typed before any route is recorded. The case pins refusal plus "no route recorded", not an admission. A runner-specific fixture is a follow-up.
- Workflow: a generated briefing is a template literal of about 10k characters with backticks; the static extractor (`extractWorkflowDispatches`, 4000 characters after `agentType`, no unescape) cannot resolve it, so the call is admitted with `GUARD-DISPATCH-WORKFLOW-PROMPT-UNRESOLVED` and no route. The same-call conflict cases run at the admission function.
- RED proofs keep the stub-based checks of `checkV10Wiring`.

Evidence (clean clone): 42 cases, 41 pass, 0 fail, 1 skipped (the pre-existing native Windows placeholder). Applies after the D214-C patch. Whether every Verify step is green is only established by a Full Verify.
