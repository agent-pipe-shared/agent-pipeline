# K142-CODEX-DISPATCH-RUNNER notes (Greenfield finding G1)

Ruleset 0.7.0+claude.20261023140247.9cb9b40, Sonnet 5.5, non-isolated clone dispatch. Status: implementation complete in clone; independent Critic read, operator commit of the protected part and PO acceptance pending.

## Design reading
- Cause: `dispatch-briefing.mjs` checked the model id against the Claude alias of the agent definition for every runner, hard-wired `runner: "claude"` into the binding, and had no `--runner` flag. The preflight call was `observePreflight({cwd})`; the preflight itself resolves its runner from the process environment (`resolveActiveRunner`), not from a parameter.
- Fix (check made runner-aware, not removed): `--runner claude|codex` (default claude). Claude path: same check, same skeleton, preflight called with exactly `{cwd}` (pinned). Codex path: expected model = the selector of the Codex route for the role (`goldfish-implementor` = `duty.implement`, `goldfish-mechanic` = `duty.mechanic`, `goldfish-deep` = `duty.deep`) from `registeredFunctionalTaskRoutes` / `functionalTaskRoutesForRunner(.., "codex")` (V3 registry, read-only).
- Refusals: `DBG-MODEL-FAMILY` (Claude text keeps naming the alias family, gains a repair clause naming --model-id, --agent-type, --runner codex and MP-29; Codex text names the route's model id and the flags), new `DBG-RUNNER-UNKNOWN`, new `DBG-MODEL-ROUTE-UNAVAILABLE` (route unavailable/unregistered; repair names the agent-type to route map and the selector command).
- Host shape found while building: the host parser (`native-goldfish-host-return.mjs`) accepts runner `codex` in a v3 block ONLY as `nativeAgentType: "worker"` instead of `agentType` (it derives the agent type from the role and adds `agentType`/`adapterVersion` on read-back). A bare `runner: "codex"` would have failed the generator's own self-check, so the Codex block uses that shape; the returned `binding` object carries `agentType` beside `nativeAgentType` (renderGoldfishBriefing reads `binding.agentType`).
- `build`: the package gets an optional `runner` string (protected lib, one-token change in OPTIONAL_STRINGS); `buildDispatchBriefing` passes it on. Value validation stays in the generator.
- (d) MP-29: the Claude refusal text now says the tool-layer `model` parameter selects the model; code comment states that nothing beyond briefing/check is claimed for Codex.

## Choices the decision left open (smallest reading, flagged)
1. Source of the Codex model: the registry projection the selector reads, NOT a call of `model-role-dispatch-select.mjs`/`selectModelRoleForTask` (with the model family active it calls `prepareModelFamilyInvocation`, a state-changing step; the generator must stay read-only). Consequence: with the family active the session-stored model could in theory differ from the registry's; not shown either way.
2. Effort of a Codex binding = the Codex route's effort (`high` for implement), not the Claude agent definition's `medium` (it would state a false effort). Pinned in the first K142 test. Tool budget stays from the agent definition (min(tier cap, maxTurns - 15)): a Claude concept reused, not shown to bind Codex.
3. Preflight "as the requested runner": for codex the env passed carries no CLAUDECODE/ANTIGRAVITY_AGENT/AI_AGENT, so `resolveActiveRunner` yields codex. Effect on real Codex-side fallback paths not shown (tests use the injected observer).
4. Antigravity: not admitted (unknown runner refused with repair), behaviour unchanged. Same hard-wiring exists for it (binding runner was always "claude"); recorded only. Host parser admits only claude|codex anyway.

## Counts (exact commands run via scratch/k142-run.mjs, alone, private TMPDIR)
- Before (base clone): `node --test plugins/pipeline-core/scripts/dispatch-briefing.test.mjs` 66/66; `dispatch-briefing-route-record.test.mjs` 13/13; `model-role-dispatch.test.mjs` 3/3; `model-role-dispatch-select.test.mjs` 10/10.
- RED (new cases first): dispatch-briefing suite 74 tests, 66 pass, 8 fail (7 on DBG-FLAG-UNKNOWN / missing repair text, the build case on DBG-PACKAGE-KEY-UNKNOWN: the intended reasons).
- Green in clone: 74/74. In `k142-check` (base HEAD + the three diffs): 74/74; unprotected+ratchet only: 73/74 (the build case needs the protected part, it is committed anyway as the contract).
- Neighbours after: 13/13, 3/3, 10/10; `check-consumer-safe-paths.test.mjs` 9/9; `node harness/scripts/check-doc-contracts.mjs` exit 0 (2589 files, 1978 links).
- `node plugins/pipeline-core/scripts/architecture-boundary-check.mjs`: base 22 violations (all pre-existing `unowned-path` of top-level `scripts/*`, not mine), 116 accepted. Without ratchet: 23 (`dispatch-briefing.test.mjs` 1086 lines > 1000). With ratchet: 22 violations, 117 accepted.

## Diffs (all `git apply --check` clean against the main checkout HEAD; applied for real in the throwaway k142-check clone)
- `scratch/agent-out/K142-codex-protected.diff`: `plugins/pipeline-core/lib/dispatch-briefing-build.mjs` (1 line). Operator commit; message `K142-msg-protected.txt`. No bundle needed.
- `scratch/agent-out/K142-codex-unprotected.diff`: `plugins/pipeline-core/scripts/dispatch-briefing.mjs`, `dispatch-briefing.test.mjs` (+142 test lines). Message `K142-msg-unprotected.txt`.
- `scratch/agent-out/K142-ratchet.diff`: `architecture/boundary-policy.json`, new exception `dispatch-briefing.test.mjs` maxLines 1086 (needed; commit with or after the unprotected diff). I did not raise any existing ratchet.
- The clone `scratch/clones/k142` still carries all edits uncommitted (nothing committed there). Order of commits: protected first (or together), so the suite is 74/74 at each commit.

## Risks / not shown
- No live Codex run; Codex entry end-to-end (host admission of a Codex native binding, guard-dispatch on it) not exercised: only the host parser read-back.
- Reference docs (`workflow-dispatch.md` line 261, `implementation-continuation.md`) still list the command without `--runner`; not edited (skill references may be byte-pinned); follow-up for the Elephant.
- `deep` on Codex maps to a frontier role route (`duty.deep`); its model id comes from the registry and may differ from implement's.
- A Claude session that passes `--runner codex` runs the preflight in codex mode and may take the documented ruleset fallbacks (DBG-RULESET-FALLBACK warning).
