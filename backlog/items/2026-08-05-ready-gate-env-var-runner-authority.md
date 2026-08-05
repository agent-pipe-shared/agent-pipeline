---
schema: pipeline.backlog-item.v1
id: pipeline.ready-gate-env-var-runner-authority
type: defect
owner: pipeline
status: open
created: 2026-08-05
source: "T1 Critic review of candidate 8d9b3df, finding F-A (major), Sprint Nova session 2026-08-05"
due: 2026-08-12
---

# `requireProjectOnboardingReady` makes an unauthenticated environment variable the runner authority for four mutating admission entrypoints

## Description

Commit `9167175` (remediating the prior Critic's F4) added to
`plugins/pipeline-core/lib/project-onboarding-ready-gate.mjs:106`:

```js
const resolvedRunner = runner ?? (process.env.CLAUDECODE === "1" ? "claude" : "codex");
```

This transplants a pattern that is safe at a CLI boundary into a shared
fail-closed gate. `pipeline-start-preflight.mjs:133` performs the identical
environment sniff, but it then passes `--runner` explicitly downstream — the
environment is the *source* at the boundary and the value becomes explicit
from there on. `requireProjectOnboardingReady` **is** the gate, and none of
its four callers supplies a runner:

- `plugins/pipeline-core/scripts/worktree-create.mjs:84-87` (`intent: "dispatch"`)
- `plugins/pipeline-core/scripts/session-cleanup.mjs:248` (two call paths)
- `plugins/pipeline-core/hooks/guard-lifecycle-ready.mjs:850-853` (`intent: "session"`)

So for all four, `process.env.CLAUDECODE` is the operative authority for an
admission decision.

## Triggering situation

T1 Critic review (Opus, `functional-equivalent-read-only`) of candidate
`8d9b3df`, finding F-A, 2026-08-05. The Critic proved the consequence chain
statically:

1. the gate resolves the runner from `process.env.CLAUDECODE`
   (`project-onboarding-ready-gate.mjs:106`);
2. the diff's own new test asserts exactly this behaviour
   (`project-onboarding-ready-gate.test.mjs:71-88`);
3. `RUNNERS_WITHOUT_APP_SERVER = new Set(["claude"])`
   (`codex-onboarding-app-server.mjs:25`, consumed at
   `project-onboarding-v3.mjs:1509`);
4. `RUNNERS_WITHOUT_NATIVE_READBACK = new Set(["claude"])`
   (`v3-bootstrap-authority.mjs:44`, consumed at `:113`, where the branch
   returns `status: "ready"` / `runtimeReadback: "not-applicable"` **without
   reading the restart barrier at all**).

Therefore `CLAUDECODE=1` present in the environment of a Codex session
downgrades both the App-Server requirement and the native-runtime-readback
attestation at four mutating entrypoints. Concrete, non-exotic scenario in
this explicitly dual-runner repo: **a Codex session spawned from inside a
Claude Code Bash tool inherits `CLAUDECODE=1`.**

Secondarily, the gate's own runner check cannot catch this: it changed from
`observed.runner !== "codex"` to `observed.runner !== resolvedRunner`
(`:158`), and because `inspect` is called with `resolvedRunner` (`:122`) and
`inspectProjectOnboardingV3` echoes it back on every `ready` result, the
comparison is self-confirming. The environment value is never validated
against an independent source of runner truth.

**Scope note (from the Critic, retained deliberately):** this is a *newly
introduced* weakening, not a pre-existing one. Before commit `9167175` the
gate hardcoded `"codex"`, so these four entrypoints always enforced the Codex
attestation path regardless of environment. It is rated **major rather than
blocker** because the prior state was itself defective — a real Claude Code
session could not pass the gate at all — so the change is net-positive on
ADR-0051's primary goal while still weakening attestation.

## Affected artifact

`plugins/pipeline-core/lib/project-onboarding-ready-gate.mjs` (the env
fallback and the now-tautological runner check),
`plugins/pipeline-core/scripts/worktree-create.mjs`,
`plugins/pipeline-core/scripts/session-cleanup.mjs`,
`plugins/pipeline-core/hooks/guard-lifecycle-ready.mjs` (the four callers),
`docs/adr/0051-dual-runner-tri-platform-development-contract.md` (the
governing contract).

## Proposal

The Critic's stated shortest correct fix: **have the four callers derive and
pass an explicit runner at their own boundaries, leaving the gate itself
without an environment fallback.** Two of the four (`worktree-create.mjs`,
`session-cleanup.mjs`) already call `parseArgs(argv)` and can accept a
`--runner` flag exactly as `pipeline-start-preflight.mjs` does. The hook
(`guard-lifecycle-ready.mjs`) needs its own boundary-appropriate derivation.

ADR-0051's Decision text is the measuring stick: *"Session/runner identity is
threaded explicitly, never inferred implicitly or defaulted silently. New
gating logic accepts and honors an explicit runner parameter/flag; it does not
hardcode one runner as the fallback default."* The gate currently accepts the
parameter (satisfied) but the four callers never pass it, so in practice
identity is still inferred and `"codex"` remains the terminal fallback.

This is gate/guardrail-class work — dispatch to `goldfish-deep`, and the
result requires its own T1 Critic round.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:**
- **Rationale:**
- **Assignment (if accepted):**
- **Date:**
