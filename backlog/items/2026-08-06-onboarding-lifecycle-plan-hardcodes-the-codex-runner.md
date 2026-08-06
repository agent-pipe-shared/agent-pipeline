---
schema: pipeline.backlog-item.v1
id: pipeline.onboarding-lifecycle-plan-hardcodes-the-codex-runner
type: defect
owner: pipeline
status: open
created: 2026-08-06
source: "Smoke test of the 0.5.2 release candidate in an empty directory, 2026-08-06: a fresh consumer following the tool's OWN printed next actions ends up with a Codex-configured project inside a Claude bootstrap."
due: 2026-09-06
---

# The V4 onboarding lifecycle plan hardcodes `runner: "codex"`, and `--runner` is accepted then discarded

## Description

`inspect` threads the runner correctly. Every `plan*` subcommand does not, in two
compounding ways.

**1. The `nextAction` drops the identity.** `inspect --root <dir> --intent bootstrap
--runner claude` returns `runner: "claude"`, `intent: "bootstrap"` — and a
`nextAction.argv` of:

```
project-onboarding-v3.mjs plan --root <dir>
```

No `--runner`, no `--intent`. The `pipeline-start` skill instructs the agent to
"execute the exact returned action", so following the contract loses the identity.

**2. The flag is accepted and then ignored.** Passing it explicitly does not help:

```
plan --root <dir>                          → runner: codex | intent: onboarding
plan --root <dir> --runner claude --intent bootstrap → runner: codex | intent: onboarding
```

`CLAUDECODE=1` was set in both runs, so this is not an environment fallback either.

## Root cause

`scripts/project-onboarding-v3.mjs` parses `--runner` into `options.runner`
(line 63) and then never passes it:

```js
else if (options.command === "plan")
  output = planProjectOnboardingLifecycleV4({ rootDir: options.root, deps, operation: "portable" });
```

Compare the line directly above it, which is correct:

```js
if (options.command === "inspect")
  output = inspectProjectOnboardingV3({ rootDir: options.root, deps, intent: options.intent, runner: options.runner });
```

`planProjectOnboardingLifecycleV4` has no `runner` parameter at all, and the
underlying default is a literal:

```js
function v4Inspection(rootDir, fs, intent = "onboarding", runner = "codex")
```

`planLifecycle` calls `v4Inspection(rootDir, fs)` with neither argument. The same
holds for `plan-runtime`, `plan-repair` and `plan-readback`, which share the
function.

## Observed consumer impact

Measured in an empty directory against the installed candidate
`0.5.2+claude.20260806101646.967bd09`, following only the tool's own next actions:

1. `inspect … --runner claude --intent bootstrap` → `adoption-required`, runner `claude`
2. the returned `plan --root <dir>` → runner silently becomes `codex`
3. `apply-portable-seed` → writes `pipeline.user.yaml` with `runners.default: "codex"`
4. `plan-runtime` → `runtime_missing: "required Codex runtime targets are absent"`

A Claude-only consumer, doing exactly what the tool tells them, is routed onto the
Codex rail with no warning and no error. Nothing crashes; every step returns exit 0
and well-formed JSON, which is what makes it dangerous.

## Why this matters more than an ordinary defect

This is the failure mode [ADR-0051](../../docs/adr/0051-dual-runner-tri-platform-development-contract.md)
exists to prevent — "identity threaded explicitly, never inferred or silently
defaulted" — on the **primary consumer onboarding path**, in the release whose
stated purpose is that the hardened Codex work also runs cleanly on Claude. It is
the same shape as the F-A finding fixed earlier in this sprint (an environment
variable as runner authority in the shared admission gate); that fix corrected the
ready gate and did not reach this path.

## Proposed fix

1. Thread `intent`/`runner` through `planProjectOnboardingLifecycleV4` →
   `planLifecycle` → `v4Inspection`, and pass `options.runner`/`options.intent` at
   the four `plan*` CLI call sites.
2. Carry `--runner`/`--intent` in every `nextAction.argv` the lifecycle emits, so
   executing the returned action verbatim preserves identity.
3. Decide separately whether an absent `--runner` should keep defaulting to
   `codex` or fail closed with a typed refusal, as the F-A remediation did
   (`PORG-RUNNER`). Defaulting silently is what produced this; but flipping it to
   fail-closed changes behaviour for existing Codex callers and is its own
   reviewed change.
4. A regression test that runs the chain as a consumer does — execute each
   returned `nextAction` verbatim and assert the runner never changes.

**Attempt 1 (dispatch `RUNNER-THREAD-17`, 2026-08-06) established the real size and
was reverted.** Three resumed rounds, roughly 650k tokens, produced: eight literal
defaults removed and identity threaded into ~16 `nextAction` emissions (87 insertions
/ 67 deletions) — and **100 failing tests** with `Cannot read properties of null
(reading 'argv')`, plus runner-expectation failures such as "Codex bootstrap accepts a
dual-runner source whose default runner is Claude". The CLI, which is where the
observed consumer harm actually lives, was never reached.

The cause is the part the briefing named as a stop condition and that was never
reported: removing the defaults cascades to internal callers that have **no explicit
runner source available**. Each of those is a genuine design question — where does
this call site's runner legitimately come from? — and there are enough of them that
this is a multi-session change, not a dispatch. The partial diff is preserved at
`runner-thread-17-partial.patch` in the session scratchpad; it is a useful starting
point, not a resumable state.

**Revised proposal: split it.**

- **Bounded fix, release-sized.** Thread `intent`/`runner` through `planLifecycle` and
  the four `plan*` CLI call sites, and carry `--runner`/`--intent` in the `nextAction`
  those emit. This fixes the measured consumer harm — a Claude consumer being routed
  onto the Codex rail — without touching the internal call sites, so the defaults stay
  and nothing cascades.
- **Full refactor, its own work.** Removing the literal defaults everywhere requires
  answering the "explicit runner source" question per call site. That is the ADR-0051
  ideal and it is worth doing; the evidence above is that it cannot be bolted onto a
  release.

There are 24 `v4Inspection` call sites; most do not thread identity today.

## Related

- [ADR-0051](../../docs/adr/0051-dual-runner-tri-platform-development-contract.md) — the contract this violates.
- [`2026-08-05-ready-gate-env-var-runner-authority`](2026-08-05-ready-gate-env-var-runner-authority.md) — same class, different path, already fixed.
- `docs/release-0.5.2-readiness.md` — carries this as the open release decision.
