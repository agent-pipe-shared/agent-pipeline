# Greenfield findings on the dev build, 2026-10-23

Collected from the PO's first Greenfield runs on the installed dev build (stamp `a1ca1806f`, version `0.7.0+<runner>.20261023140247.9cb9b40`). Status words follow the repository rule: nothing here is fixed or accepted. Fixes are batched (candidate-stamping discipline) and followed by a re-stamp. Severity is the Elephant's first reading, the PO decides.

| Id | Runner | Finding | Severity (first reading) | Evidence | State |
|---|---|---|---|---|---|
| G1 | Codex/WSL | The implementation dispatch fails at the briefing generator: the configured Codex route selects the model `gpt-6-luna`, while `plugins/pipeline-core/scripts/dispatch-briefing.mjs` checks the model id against the family of the agent definition's `model:` alias (`sonnet`) and refuses with `DBG-MODEL-FAMILY` (line 567 to 569). The refusal names no repair. `--runner codex` is not an admitted flag (`DBG-FLAG-UNKNOWN: unknown flag --runner`); the generator sets its runner internally to `claude`, and its tests pin that behaviour. The session correctly refused to bypass the generator ("implementation only via Goldfish dispatch") and stopped; its blocker note is `specs/onboarding-1477bf21ca11/evidence/implementation-blocker.md` in the Greenfield project. No productive Codex entry point exists in the installed scripts | Blocker for implementation dispatch on Codex | PO paste of the Codex session, 2026-10-23 | OPEN, not yet scoped for a fix |
| G2 | Claude | PO report "something blocks" in the Claude Greenfield run, text not yet supplied | unknown | pending the PO's paste | OPEN, needs the refusal text |
| G3 | Antigravity | See PO list row 58: the Antigravity session reports the runner view with the `+claude` suffix; whether it read a Claude manifest or the view carries one is open | observation | PO list row 58 | OPEN |

## G1 fix questions (for the batch, not decided)

- What does the family check protect on Claude (a dispatch must not silently run another family than the agent definition declares, MP-29)? A Codex dispatch has no Claude alias, so the check needs a runner-aware reading, not a removal.
- Where does a Codex session learn the model id of its role route, and should the generator accept `--runner codex` and take the family from the Codex route table instead of the agent frontmatter?
- The refusal must name a repair (never-fully-blocking rule): today it states only the mismatch.
- The change touches the briefing generator and probably its protected builder library (`lib/dispatch-briefing-build.mjs`, sitting step 23); expect a protected diff for the operator.
