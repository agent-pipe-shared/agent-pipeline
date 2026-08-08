---
schema: pipeline.backlog-item.v1
id: pipeline.onboarding-restart-flow-is-codex-only-not-runner-aware
type: defect
owner: pipeline
status: closed
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

## Additional evidence, 2026-08-07 (second independent repro)

A second live onboarding test in the same `rune_test1_claude` line of work
reproduced the same shape from a different angle and surfaced two more
findings, independently re-verified against current HEAD in the Nova GMW
session (`plugins/pipeline-core/lib/project-onboarding-v3.mjs:1455-1474`
re-read directly, unchanged since this item was filed):

1. **`restartAction(_root, barrierSha256)` re-confirmed unchanged.** `_root` is
   still unused (underscore-prefixed) and there is still no `runner`
   parameter anywhere in the function signature or its call site
   (`lib/project-onboarding-v3.mjs:3055`) -- the analysis above still holds
   verbatim against current HEAD, not just the commit this item was
   originally filed against.
2. **`scripts/native-plugin-readback.mjs` is not a usable starting point for
   the fix.** It looked, from its filename alone, like it might be an
   existing Claude-native counterpart to `codex-onboarding-launch.mjs`.
   Independently checked: `grep -rl "native-plugin-readback"
   plugins/pipeline-core --include=*.mjs` returns only its own test file --
   it is reachable from nowhere in the onboarding/restart lifecycle. Reading
   its own schema (`pipeline.btm-d2-native-readback.v1`) and phase names
   (`prepared`, `update-observed`, `reload-observed`, `trust-observed`,
   `fresh-session-observed`, `verified`, `blocked`) shows it is actually a
   **native plugin install/update readback verifier** -- checking that a
   `claude plugin update` + reload/restart actually took effect -- not a
   restart *launcher* at all. It is dead code today (unwired, tested only in
   isolation) and not directly reusable for this item's fix; a genuine
   Claude-native restart path still needs to be built from scratch.
3. **A separate, upstream guard-grammar defect was hit and worked around
   while reaching this point**, now filed separately:
   [`2026-08-07-guard-lifecycle-ready-rejects-plan-runtime-intent-argv.md`](2026-08-07-guard-lifecycle-ready-rejects-plan-runtime-intent-argv.md).
   It does not change this item's root cause, but explains why a session
   following the tool's own suggested command literally can dead-end one
   step earlier than the restart action itself.

Conclusion unchanged from root cause #1: even with `--runner claude` threaded
correctly from the very first command (which the guard-grammar defect above
made harder than it should be), a session still lands on
`codex-onboarding-launch.mjs` at the restart step. This is a real, live-path
gap, not only a static-reading concern -- confirmed twice now, from two
independent onboarding-test sessions.

## Third repro, 2026-08-07 evening — and it is worse than "surprising routing"

PO, live, setting up a genuinely empty new project (`rune_test1_claude_052_28`)
with the Claude runner against the local `0.5.3+claude.20260807221336.14e7b97`
build. Verbatim: *"es gibt immer noch keinen sauberen aufsetzpfad für ein leeres
frisches repo/ordner mit claude! es hängt immer noch und läuft nicht sauber
wegen codex"*. The session's own diagnosis, which this item now adopts because
it is more precise than everything above it:

1. **A Claude session cannot clear the restart barrier at all.**
   `initialize-runtime` publishes `.git/agent-pipeline/onboarding/restart-barrier.json`
   with `restart-required`. The only thing that clears it is
   `completeRuntimeReadback`, which demands an **authenticated launch ticket**
   issued by `scripts/codex-onboarding-launch.mjs`. The guard refuses every
   tool-call to that launcher by design (`externalRestartOnly`) — it is for an
   external terminal only. So a Claude Code restart, which is exactly what the
   `nextAction` instructs the human to perform, **provably cannot** clear it.
   The PO restarted, and nothing changed, because nothing could.
2. **The barrier's own runtime targets are exclusively `.codex/*`** —
   `config.toml` plus three agent definitions. For a Claude session the barrier
   is guarding the re-read of files that session does not use.
3. **Until the lifecycle is `ready`, the guard refuses every project write.** So
   the failure is not cosmetic: a fresh Claude-only repository is inert. No spec,
   no code, no kickoff. The setup path does not merely route oddly; it terminates.
4. **The escape requires a second runner's binary on the machine.** The workaround
   that worked was the human running, in an external WSL terminal,
   `node .../codex-onboarding-launch.mjs --root . --barrier-sha256 <hash> --activate`,
   which returned `{"status":"launched"}`, cleared the barrier, and let the
   lifecycle proceed to `kickoff-required` and then `ready`. It works — and it
   means the documented Claude onboarding path has a hard dependency on Codex
   being installed, pinned, and launchable. That is not a runner-neutral product.
5. **Two bootstrap steps cannot run in their own prescribed order.**
   `observation-governance-bootstrap.mjs` and `resume-hint.mjs inspect` are both
   refused while the lifecycle is not `ready`, but the bootstrap protocol places
   them before the confirmation line. The session read the resume-hint file
   directly instead and said so rather than claiming the typed readback had run —
   correct behaviour, and evidence that the step ordering is itself wrong.

**What this changes for triage.** The suggested fix direction above (thread
`runner`, branch `restartAction`) is necessary but no longer sufficient. Even a
perfectly runner-aware `restartAction` has nothing to route a Claude session
*to*: the barrier-clearing mechanism is ticket-bound to the Codex launcher.
Either a Claude-native readback path has to exist, or a Claude session must not
publish a restart barrier whose targets are all `.codex/*` in the first place.
The second is smaller and probably correct: a barrier exists to force a re-read,
and there is nothing for a Claude session to re-read there.

Priority is no longer "not urgent enough to interrupt" — the PO has now hit this
on three separate occasions, and it is the first thing any new adopter on the
Claude runner will meet.

## Closure, 2026-08-08 — fixed by `864c7f1`, verified independently

Closed against commit `864c7f1f84b5e0a874e360bf26e168fa92f14aaf` (dispatch
RUNAUT-1), which landed on `feat/sprint-nova-codex-v046` after this item's last
re-verification and therefore was not visible to it.

Both halves this item names are addressed, and the fix follows the conclusion
this item itself reached — not the earlier "Suggested fix direction":

1. **The barrier is no longer published for a runner that has nothing to
   re-read.** `applyLifecycle` gates publication on
   `requiresNativeRuntimeReadback(beforeApply.runner)`
   (`plugins/pipeline-core/lib/project-onboarding-v3.mjs:3809`). A `claude`
   chain never reaches `prepareRuntimeRestartBinding`, so the unclearable gate
   this item described does not come into existence. The exemption is one closed
   membership test asserted equal to the set the V3 bootstrap authority already
   uses, and it fails closed: an **unnamed** runner keeps the Codex-strength
   barrier.
2. **`restartAction` is runner-aware.** It now takes `runner` and returns
   `externalOperatorRestartAction(runner)` for anything other than `codex`
   (`:1572`), so no Claude session is handed the Codex launcher.
3. **The kickoff dead end is gone.** `planProjectOnboardingKickoffV4` and its
   apply sibling no longer inspect with a hardcoded `"codex"`, which is what
   made a Claude initialization report `runtime-attestation-required` and
   produce no plan at all.

**Verification.** Re-read at the two line numbers above by the orchestrator
independently of the dispatch that reported the closure, because a
"pre-existing/already fixed" claim is a claim needing evidence
(`2026-08-08-pre-existing-failure-is-a-claim-that-needs-evidence.md`), and two
such claims were wrong earlier the same night. Suites green on the current tip:
`project-onboarding-v3` 107/0, `guard-lifecycle-ready` 51/0,
`codex-onboarding-runtime` 19/0.

**Not closed by this, and deliberately still open:** the `runner = "codex"`
parameter defaults this item lists as root cause #2 remain. They are their own
decision, now taken as fail-closed in
`2026-08-07-absent-runner-flag-silently-defaults-to-codex.md`, with its own
implementation still to come. Closing this item does not close that one.

**Process note.** A dispatch was briefed against this item on 2026-08-08 and
correctly stopped on a briefing-vs-repo contradiction rather than inventing work.
The orchestrator had not checked the code before briefing, although the closing
commit was already on the branch and had already been reported to the PO by name.
The cost was one dispatch budget. The general lesson is recorded in
`2026-08-08-pre-existing-failure-is-a-claim-that-needs-evidence.md`, which until
now only covered the inverse error.

## Triage (filled in by the Elephant of the next Pipeline session)

Not yet triaged -- the PO submitted this as a detailed, reproducible defect
report (not urgent enough to interrupt in-progress GMW work) with a known
manual workaround. Left `status: open`, untriaged, for a session with
capacity to thread `runner` through the onboarding module properly (guardrail/
core-logic change -- belongs in a full Goldfish-deep + Critic dispatch, not a
same-session hotfix). The second repro above (2026-08-07) does not change
this assessment; it strengthens the evidence without closing the sizing
question.
