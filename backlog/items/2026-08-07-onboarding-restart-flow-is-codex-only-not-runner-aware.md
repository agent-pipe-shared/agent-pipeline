---
schema: pipeline.backlog-item.v1
id: pipeline.onboarding-restart-flow-is-codex-only-not-runner-aware
type: defect
owner: pipeline
status: open
created: 2026-08-07
source: "PO handover from a separate session (rune_test1_claude), submitted through the PO's own channel, 2026-08-07."
due: 2026-09-06
expires: 2026-09-06
---

# Onboarding restart flow always launches Codex, regardless of the active runner

## Symptom

In a Claude Code session (happy-path onboarding test of a new repository), the
Pipeline-suggested "restart" action during onboarding launched the Codex CLI
process instead of continuing/resuming the Claude Code session.

## Root cause #1 (primary): restart flow is Codex-only, not runner-aware

`plugins/pipeline-core/lib/project-onboarding-v3.mjs:1455-1474`, function
`restartAction(_root, barrierSha256)` -- takes no `runner` argument.
Unconditionally returns a `restart-process` `nextAction` whose `launch.argv`
points at `scripts/codex-onboarding-launch.mjs`.

`plugins/pipeline-core/scripts/codex-onboarding-launch.mjs:119` spawns
`issued.executable` with `stdio: "inherit"`; that executable is resolved via
`lib/codex-onboarding-runtime.mjs`, where it is bound/pinned throughout as the
"Codex executable" (`codexExecutable`, `codexExecutableSha256`,
`boundExecutable(...)`, error strings like "Codex executable path is
invalid"). There is no Claude-native restart launcher anywhere in the plugin
(no `claude-onboarding-launch.mjs` or equivalent).

Call site: `lib/project-onboarding-v3.mjs:3055`,
`nextAction: restartAction(legacy.root, barrier.rawSha256)` -- reached
whenever onboarding observes a restart-required runtime state, regardless of
which runner (Claude or Codex) is driving the session.

## Root cause #2 (contributing): runner silently defaults to "codex"

- `inspectProjectOnboardingV3` (`lib/project-onboarding-v3.mjs`) and its
  internal helpers (`v4Inspection`, `lifecycleResult`, `readyLifecycleResult`,
  etc.) all default their `runner` parameter to the hardcoded literal
  `"codex"`.
- The only place that correctly derives the runner from the actual
  environment is `plugins/pipeline-core/scripts/pipeline-start-preflight.mjs:190`:
  `const runner = env.CLAUDECODE === "1" ? "claude" : "codex";` -- and that
  detection is used only for preflight's own one-shot `nextAction`, not
  propagated as a code-level default anywhere else.
- `pipeline.user.yaml`'s `runners.default: "claude"` is never consulted for
  this purpose (the onboarding lib does not read it into any `runner =
  "codex"` default).
- Prose command examples in `skills/pipeline-start/SKILL.md` and
  `skills/pipeline-start/references/onboarding-recovery.md` (kickoff /
  adopt-remote examples) do not show `--runner`. An agent or human
  reconstructing the command from that prose instead of executing the literal
  returned JSON argv silently falls through to the Codex default.

## Live repro

`node scripts/project-onboarding-v3.mjs inspect --root <repo> --intent
session` (no `--runner`) returned `"runner": "codex"` and `"appServer":
{"required": true, "status": "running", "code": "CAS-READY"}` even though the
session was Claude Code and `pipeline.user.yaml` declared `runners.default:
"claude"`. Re-running with `--runner claude` returned `"runner": "claude"` and
an app-server field reading not-applicable -- confirming the App-Server/Codex-
specific gate is pulled in only because of the missing/defaulted runner, not
because it is actually needed.

Repro root: a `rune_test1_claude` test project under the PO's own `src/`
directory. Plugin root at the time: the local marketplace
(`~/agent-pipeline-local-marketplace`).

## Impact

Any Claude-driven session that reaches a restart-required state during
onboarding is routed into launching Codex instead of continuing in Claude --
surprising, and breaks the runner-neutral claim in
`skills/pipeline-start/SKILL.md` line 7. Known workaround in the meantime:
explicitly pass `--runner claude` when reconstructing any onboarding CLI
command by hand, or manually resume the Claude Code session instead of
following the auto-launch action when it appears.

## Suggested fix direction (not implemented, for triage only)

1. Thread `runner` through `restartAction(...)` and its call site; when the
   active runner is Claude, offer a Claude-native restart/resume action
   instead of `codex-onboarding-launch.mjs` -- or, short of building that
   launcher, at minimum have `restartAction` refuse/branch rather than
   silently emitting a Codex-only action for a Claude session.
2. Make the `runner = "codex"` fallback defaults derive from `env.CLAUDECODE`
   (like preflight already does) or from `pipeline.user.yaml`'s
   `runners.default`, instead of a hardcoded literal, so every internal
   helper agrees with what preflight already knows.
3. Update the prose command examples in `SKILL.md` and
   `onboarding-recovery.md` to include `--runner {{RUNNER}}` explicitly, so a
   copy-reconstruction can't silently drop it.

## Triage (filled in by the Elephant of the next Pipeline session)

Not yet triaged -- the PO submitted this as a detailed, reproducible defect
report (not urgent enough to interrupt in-progress GMW work) with a known
manual workaround. Left `status: open`, untriaged, for a session with
capacity to thread `runner` through the onboarding module properly (guardrail/
core-logic change -- belongs in a full Goldfish-deep + Critic dispatch, not a
same-session hotfix).
