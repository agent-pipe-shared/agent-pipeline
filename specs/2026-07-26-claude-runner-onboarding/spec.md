# Spec CLAUDE-RUNNER-01: Claude Code as a first-class runner in the V3/V4 onboarding lifecycle

| Field | Value |
|---|---|
| Rigor level | 2 (core onboarding/guard-lifecycle logic, existing production files) |
| Risk class | high (dispatch-gating logic; a wrong fix can either falsely block or falsely admit implementation work) |
| Status | implemented |
| Date | 2026-07-26 |
| Readiness check | performed before first dispatch (see the "Correction after readiness check" and "New, from readiness check" notes in §2 and the Open items section below) and superseded by the now-complete, independently Critic-verified implementation; no separately filed readiness-check artifact exists beyond those inline corrections |
| Related | `prd_claude-runner-onboarding.md` (same PO gate); discovered during the 0.4.6 rebase onto `feat/sprint-cyborg-claude` (`docs/state.md`, 2026-07-26 entries); no upstream GitHub issue — this is a Pipeline-self-application scope addition, same class as `windows-sandbox-assurance-slice-scope.md` |

---

## PART A — Full spec

### 1. The Problem

The 0.4.6 `pipeline.project-onboarding.v4` lifecycle
(`lib/project-onboarding-v3.mjs`) treats Codex as the only real runner in two
independent, unconditional ways. First, `lifecycleResult()` defaults its
`runner` field to the literal `"codex"`, and `selectedRunnerIsCodex()` (used
inside the "partial" V3-source classification branch) hard-rejects any
project whose `pipeline.user.yaml` has `runners.default` set to anything
other than `"codex"`, returning `status: "invalid"` with guidance to "select
Codex through the source authority" and no recovery `nextAction`. Second, and
independently, `project-onboarding-ready-gate.mjs`'s
`requireProjectOnboardingReady()` throws `PORG-INVALID-OBSERVATION` whenever
`observed.runner !== "codex"`, even when the underlying observation is
otherwise `status: "ready"` — this sits downstream of every mutating
onboarding entrypoint (`onboarding`/`bootstrap`/`session`/`dispatch`).
Third, `codex-onboarding-app-server.mjs` and `v3-bootstrap-authority.mjs`
unconditionally require proof that a Codex App-Server daemon is running and
that a Codex-specific restart/readback attestation has been produced
(`codex-onboarding-runtime.mjs`'s restart barrier binds a
`codexExecutableSha256`) for `bootstrap`/`session`/`dispatch` intents,
regardless of which runner is actually in use — a concept Claude Code has no
analogue for and can never satisfy through normal use.

This repository's own `pipeline.user.yaml` already declares
`agent_runtime: "claude-code"` and `runners.default: "claude"`. If this
project's onboarding state were ever classified into the "partial" branch
(a real, not hypothetical, state — e.g. after a plugin version bump changes
what "complete" means), the lifecycle would reject it with instructions to
switch to Codex, which is wrong for an exclusively-Claude project, and
`requireProjectOnboardingReady` would independently reject it a second way
even if the first check were fixed. `agent_runtime` itself is confirmed
write-only today: it is set once in `freshIntent()` and validated as an enum
member elsewhere, but never read as a branch condition anywhere in the
lifecycle.

### 2. Technical Plan

Introduce `runner` as an explicit, correctly-derived value threaded through
the V4 lifecycle, and make every Codex-only requirement conditional on it,
rather than unconditional. Concretely:

- **Runner derivation.** Replace the codex-only `selectedRunnerIsCodex()`
  check with a general `selectedRunner(root, fs)` that reads
  `runners.default` from `pipeline.user.yaml` and returns whichever value is
  present (`"claude"` or `"codex"`), validated against the same enum
  `runners.enabled` already declares. `lifecycleResult()`'s `runner` default
  changes from the hardcoded literal `"codex"` to being always explicitly
  passed by each call site (no silent default), derived from this function
  where a source exists, or `null` where none does yet (fresh/unsafe paths
  keep today's `null`-on-failure semantics unchanged).
- **Removing the hard reject.** The "partial" branch's
  `if (!selectedRunnerIsCodex(...)) return lifecycleResult({status:"invalid",...})`
  is removed. In its place, the branch proceeds using the derived runner
  value for every subsequent runner-conditional decision below. An
  `runners.default` value outside the enum (`"claude"|"codex"`) remains a
  genuine `invalid` rejection — this spec narrows the check, it does not
  remove runner validation entirely.
- **Runner-conditional App-Server/restart requirement.** `observeReadyAppServer`
  (in `project-onboarding-v3.mjs`) and `observeOnboardingAppServer`
  (`codex-onboarding-app-server.mjs`) become conditional on the derived
  runner: for `runner === "codex"`, behavior is byte-identical to today
  (mandatory for `bootstrap`/`session`/`dispatch`). For `runner === "claude"`,
  the function returns a new, honest `{ required: false, status:
  "not-applicable", code: null }` shape (extending, not replacing, the
  existing `validAppServerComponent()` contract — see AC-3) rather than ever
  attempting to observe a daemon Claude does not run. This must be a real
  "not required for this runner" state, never a fabricated `"running"` claim.
- **Runner-conditional restart/readback.** `v3-bootstrap-authority.mjs`'s
  unconditional native-Codex-readback requirement
  (`readRestartBarrier`/`readCurrentRuntimeReadback` calls inside
  `projectionCurrent`) becomes conditional the same way: for `runner ===
  "claude"`, the authority can reach `ready`/`projection-current` without a
  Codex restart-barrier artifact ever existing, because Claude Code has no
  comparable "must prove a fresh process reloaded the runtime" contract in
  this codebase. This spec does NOT invent a new Claude-side attestation
  mechanism to replace it — Claude Code's own session lifecycle (governed
  elsewhere, e.g. `hooks/hooks.json` SessionStart) is the existing
  functional equivalent, and duplicating it here would be scope creep beyond
  what the PRD asks for.
- **`requireProjectOnboardingReady` fix.** The `observed.runner !== "codex"`
  throw in `project-onboarding-ready-gate.mjs` is replaced with a check
  against the validated runner enum (`"claude"` or `"codex"`), not a single
  literal — this is the second independent blocker found during design
  research and must not be missed (it is downstream of, and separate from,
  the `project-onboarding-v3.mjs` fixes above; fixing only the lifecycle
  without this file leaves every mutating entrypoint still rejecting a
  ready Claude project).
- **`guard-lifecycle-ready.mjs` parity (Decision point 1, PRD).** Per the
  PRD's recommended resolution (equivalent enforcement for Claude), add a
  Claude-side wiring so `requireProjectOnboardingReady` is enforced the same
  way Codex enforces it today. **Correction after readiness check:** this is
  NOT a mirror of an existing registration pattern — `guard-lifecycle-ready.mjs`
  is never itself registered as a hook target today; Codex's
  `codex-hooks.json` registers `codex-pretool-guard.mjs` (on both its `Bash`
  and `apply_patch|Edit|Write` matchers), which then calls
  `evaluateLifecycleReadyGuard` as an in-process function import. The Claude
  wiring is therefore a genuinely new registration shape, to be built
  analogous to (not copied from) that pattern. Scope for this package is the
  `Edit|Write` matcher only (AC-8) — `Bash`-matcher parity (which Codex's
  wiring also has, for sanctioned-lifecycle-command detection) is explicitly
  OUT of scope here and tracked as a follow-up, not silently included or
  silently dropped.
- **`agent_runtime` stays inert for this package (Decision point 2, PRD —
  resolved as: keep unchanged).** The narrower `runners.default`-based
  derivation above is sufficient to close both hard-reject bugs; wiring
  `agent_runtime` as a second, redundant discriminator is out of scope here
  to keep the change minimal and reviewable. This is a deliberate deferral,
  not an oversight — flagged for a future package if a real need for a
  double-discriminator design ever surfaces.
- **`config/runtime-projection-v3-owned-keys.json` unchanged** — per PRD
  Decision point 2, the seven owned targets (three `.claude/*`, four
  `.codex/*`) remain unconditionally projected for every project regardless
  of runner. A Claude-only project continues to receive inert `.codex/*`
  scaffold files, same as today; this spec does not make projection
  runner-conditional.

```
runner="codex"  → today's exact behavior, byte-identical, no regression
runner="claude" → App-Server/restart checks short-circuit to
                  "not-applicable"; selectedRunner() no longer rejects;
                  requireProjectOnboardingReady() accepts a ready
                  observation; guard-lifecycle-ready.mjs is enforced via
                  hooks.json the same way it already is via
                  codex-hooks.json for Codex
runner=<other>  → unchanged: invalid, rejected (enum violation)
runner=null     → unchanged: today's existing null/unsafe-path semantics
```

### 3. Alternatives (mandatory)

| Alternative | Rejected because |
|---|---|
| Patch only `selectedRunnerIsCodex()` in `project-onboarding-v3.mjs` | Leaves the independent `project-onboarding-ready-gate.mjs` hard-reject and the App-Server/restart requirement in place — a Claude project would still be permanently stuck at `app-server-not-running`/`PORG-INVALID-OBSERVATION` for `bootstrap`/`session`/`dispatch`. Symptom-only fix. |
| Give Claude a synthetic/always-passing App-Server status | Would fabricate a false "running" claim for a daemon that does not exist for this runner — violates this repo's own evidence-integrity discipline (no model-written/fabricated success claims). The honest `not-applicable` state is required instead. |
| Build a new Claude-side restart-barrier/readback mechanism parallel to Codex's | Out of proportion to the problem: Claude Code's session lifecycle is already governed by its own hooks; duplicating Codex's digest-bound restart-proof machinery for a runner that doesn't need it is speculative engineering beyond the PRD's ask. |
| Activate `agent_runtime` as the lifecycle's runner discriminator instead of `runners.default` | `agent_runtime` is currently fully unread/inert; wiring it in now is a second, parallel discriminator next to `runners.default`, adding cross-field-consistency surface (what if they disagree?) without shrinking the actual fix. Deferred, not solved by this package (PRD Decision point 2). |
| Leave `guard-lifecycle-ready.mjs` Codex-only (no Claude wiring in `hooks.json`) | Would leave Claude projects with strictly weaker enforcement than Codex projects at the exact gate that decides "may this implementation write proceed" — contradicts the PRD's "Claude as a genuinely first-class runner" goal. Rejected per PRD Decision point 1's recommendation. |

### 4. Detailed Implementation (every file + rationale)

| # | File (repo-relative) | Change | Rationale |
|---|---|---|---|
| 1 | `plugins/pipeline-core/lib/project-onboarding-v3.mjs` | modify | Replace `selectedRunnerIsCodex()` with `selectedRunner()`; remove the hard `"invalid"` reject on a non-Codex runner in the "partial" branch; thread the derived runner value into `lifecycleResult()` calls instead of relying on the hardcoded `"codex"` default; make `observeReadyAppServer` runner-conditional. |
| 2 | `plugins/pipeline-core/lib/project-onboarding-ready-gate.mjs` | modify | Replace the `observed.runner !== "codex"` literal check (line ~150) with validation against the runner enum (`"claude"`/`"codex"`), so a `ready` observation for either supported runner is accepted. |
| 3 | `plugins/pipeline-core/lib/codex-onboarding-app-server.mjs` | modify | `observeOnboardingAppServer` gains a runner parameter; for `"claude"`, returns the new `{required:false, status:"not-applicable", code:null}` shape instead of attempting Codex daemon observation. |
| 4 | `plugins/pipeline-core/scripts/v3-bootstrap-authority.mjs` | modify | Make the native-Codex-readback requirement inside `projectionCurrent`/`validateV3BootstrapAuthority` conditional on the derived runner; for `"claude"`, authority can reach `ready` without a restart-barrier artifact. |
| 5 | `plugins/pipeline-core/lib/codex-onboarding-runtime.mjs` | modify (narrow) | Callers gain a runner-conditional bypass path; the module's own restart-barrier/readback schemas and Codex-executable-digest logic stay unchanged for the Codex path (no regression), only the call sites from #4 change how/whether they invoke it for `"claude"`. |
| 6 | `plugins/pipeline-core/hooks/guard-lifecycle-ready.mjs` | modify (minimal) | Confirm/adjust its own logic is runner-neutral now that its upstream gate (#2) is fixed; no behavior change expected beyond what #1/#2 already provide, but must be re-verified against a Claude-runner fixture. |
| 7 | `plugins/pipeline-core/hooks/hooks.json` | modify | Add a Claude-side `Edit|Write` matcher entry wiring `guard-lifecycle-ready.mjs` (or an equivalent thin Claude-facing wrapper if the existing file has Codex-only imports that can't run under Claude's hook runtime — implementer's call, documented if taken), mirroring `codex-hooks.json`'s existing wiring. |
| 8 | `plugins/pipeline-core/lib/project-onboarding-v3.test.mjs` | modify | Add fixtures: a `"claude"`-runner project reaching `ready` through the "partial"/App-Server/restart branches without any Codex-only rejection; confirm the `"codex"` path is byte-unchanged (regression fixtures for every existing named test must still pass). |
| 9 | `plugins/pipeline-core/lib/project-onboarding-ready-gate.test.mjs` | modify | Add a fixture: a `ready` observation with `runner: "claude"` is accepted by `requireProjectOnboardingReady`; confirm an out-of-enum runner value still throws. |
| 10 | `plugins/pipeline-core/lib/codex-onboarding-app-server.test.mjs` | modify | Add fixtures for the new `runner: "claude"` → `not-applicable` path; confirm Codex path unchanged. |
| 11 | `plugins/pipeline-core/scripts/v3-bootstrap-authority.test.mjs` | create | No test file exists for this script today (confirmed absent) — this is net-new coverage, not a regression-safe modification of an established fixture pattern. Must cover: a Claude-runner fixture reaching `ready` without a restart-barrier artifact, AND enough of the existing Codex-path behavior (ready/host-init-required/projection-drift per §2) to prove #4's change didn't silently alter the Codex path, since no pre-existing test protects that today. |
| 12 | `docs/product-capability-inventory.json` | modify | This repo's own self-application surface-coverage gate (HAW-A01/HAW-A02) required registering the new surfaces this package introduced: the `v3-bootstrap-authority-tests` verify-phase entry (added alongside the `verify.mjs` registration, commit `609b50e`) and the new `hooks.json` `PreToolUse:Edit\|Write` `guard-lifecycle-ready.mjs` hook surface (added under `claude-hook-safety`, commit `5dd5e6a`, after an interim registration in `8831854` was reverted in `fceab40` and corrected). |
| 13 | `harness/scripts/verify.mjs` | modify | Registers `v3-bootstrap-authority.test.mjs` as a named `v3-bootstrap-authority-tests` entry in `TEST_SUITES` so the project's own aggregate verify gate actually exercises the only test coverage protecting `v3-bootstrap-authority.mjs` (closes Critic finding F2, major, commit `609b50e`). |
| 14 | `plugins/pipeline-core/hooks/guard-lifecycle-ready.test.mjs` | modify | Pre-existing test file (predates this package) extended twice: first with AC-8 fixtures proving the new Claude `Edit\|Write` wiring (commit `b2202ac`), then with an end-to-end no-stub proof of the governed+READY allow path and fail-closed coverage for a broken/malformed owned-key manifest (closes Critic findings F3 minor and F4 major, commit `984ebb5`). |

No other file in the four investigated candidates
(`runner-profiles-v3.mjs`, `runner-profile-migration-v3.mjs`,
`config/runtime-projection-v3-owned-keys.json`) is touched by this package —
per PRD Decision point 2 and the Alternatives table, `agent_runtime` wiring
and owned-keys conditionality are explicitly deferred, not silently
in-scope. The table above now totals 14 items: the original 11 plus 3
(items 12-14) that are post-implementation hardening and self-application-
gate follow-ups discovered during Critic review, not silently expanded
original scope.

### 5. Acceptance Criteria (EARS)

- AC-1: WHEN a project's `pipeline.user.yaml` has `runners.default: "claude"`
  and the onboarding lifecycle classifies it into the "partial" branch, THE
  SYSTEM SHALL proceed to derive its runtime/App-Server/restart status using
  `runner: "claude"` rather than returning `status: "invalid"`.
- AC-2: WHEN a project's `pipeline.user.yaml` has `runners.default` set to a
  value outside the enum `["claude","codex"]`, THE SYSTEM SHALL still return
  `status: "invalid"` at the same JSON path (`$.source.runners.default`) with
  the same error code (`source_invalid`) as before this package — this
  criterion proves AC-1 narrowed the check rather than removed runner
  validation entirely. The diagnostic *wording* itself was intentionally
  changed (commit `88c8029`) to stay accurate now that the check is
  enum-based rather than Codex-only, and this is not a regression: the
  message text went from `"the selected runner is not Codex"` / `"select
  Codex through the source authority"` to `"the selected runner is not one
  registered, enabled runner"` / `"select one enabled registered runner
  through the source authority"`. Per §6's level-2 spec-deviation-update
  rule, this note documents that deliberate wording change; the
  `status`/path/code invariants above are what AC-2 actually verifies.
- AC-3: WHEN `observeOnboardingAppServer`/`observeReadyAppServer` is invoked
  with `runner: "claude"` for intent `bootstrap`, `session`, or `dispatch`,
  THE SYSTEM SHALL return `{required: false, status: "not-applicable", code:
  null}` and SHALL NOT block the lifecycle on App-Server unavailability.
- AC-4: WHEN `observeOnboardingAppServer`/`observeReadyAppServer` is invoked
  with `runner: "codex"`, THE SYSTEM SHALL behave byte-identically to the
  pre-change 0.4.6 behavior (regression proof, not a new behavior).
- AC-5: WHEN `validateV3BootstrapAuthority` is invoked for a `runner:
  "claude"` project with no restart-barrier artifact on disk, THE SYSTEM
  SHALL be able to reach `status: "ready"` (subject to all its other
  non-Codex-specific checks passing) rather than fail closed on a missing
  Codex-executable digest.
- AC-6: WHEN `requireProjectOnboardingReady` receives an observation with
  `status: "ready"` and `runner: "claude"`, THE SYSTEM SHALL accept it
  without throwing `PORG-INVALID-OBSERVATION`.
- AC-7: IF `requireProjectOnboardingReady` receives an observation with a
  `runner` value outside the validated enum, THEN THE SYSTEM SHALL still
  throw `PORG-INVALID-OBSERVATION` — proves AC-6 narrowed, not removed, this
  check.
- AC-8: WHEN an Edit/Write tool call targets a Pipeline-governed root under a
  Claude Code session, THE SYSTEM SHALL enforce the same
  `requireProjectOnboardingReady` gate that Codex's `codex-hooks.json`
  already enforces via `hooks/hooks.json`'s own matcher wiring.
- AC-9: WHEN this package's full change set is applied, THE SYSTEM SHALL
  still pass every pre-existing test in
  `project-onboarding-v3.test.mjs`/`project-onboarding-ready-gate.test.mjs`/
  `codex-onboarding-app-server.test.mjs`/`v3-bootstrap-authority.test.mjs`
  unchanged, proving the Codex runtime path has zero regression.

### 6. Definition of Done

- All 9 acceptance criteria above have green, machine-run checks: each AC
  maps to a named test in one of the four `*.test.mjs` files listed in §4,
  runnable via `node --test <file>` individually and via
  `node harness/scripts/verify.mjs` as part of the full registered suite.
- Evidence artifact mandatory: `verify.mjs` script-written output + command +
  exit code (never model-written prose).
- This is rigor level 2, risk class high: an independent Critic review is
  mandatory before merge, using the higher-capability route with the
  selected runner's usable native isolation, or the standing PO-authorized
  functional equivalent (fresh independently-briefed Critic subagent,
  refs-only bounded input, JSON-schema verdict) if native isolation is
  unavailable — per `spec.md` template §6 discipline (operating-model §4.2).
- Spec updated BEFORE merge on any implementation deviation (level 2 rule).
- Full regression: `node harness/scripts/verify.mjs` at the candidate commit
  must show the same 21 pre-existing (main-baseline) failures as documented
  in `docs/state.md`'s 2026-07-26 entries, with ZERO new failures beyond
  that set, and the four files in §4 items 8-11 must show exit 0 on their
  own targeted runs.
- `security-scan.mjs` run at the candidate commit: no new finding beyond the
  already-documented branch-independent gitleaks false positive.
- Canonical DoD checklist: `harness/definition-of-done.md` §2 (copy the
  block, strike items per the rigor matrix §4 there).

---

## Open items carried into dispatch briefings

1. **Corrected after readiness check:** `codex-onboarding-launch.mjs`,
   `codex-project-runtime-readback-host.mjs`, `codex-app-server-health.mjs`,
   and `codex-host-repository-init.mjs` are NOT ES-module imports of
   `guard-lifecycle-ready.mjs` — they appear only as path strings used to
   pattern-match sanctioned command argv, never executed in-process, so they
   are not a Claude-callability concern. The genuine open question is
   different: `guard-lifecycle-ready.mjs` imports
   `hasCodexExistingGitControlMount`/`readCodexHostRepositoryInitAdmission`
   from `codex-host-layout.mjs` and uses them in a documented
   Codex-sandbox-specific fallback branch (observed near the file's
   restart/admission handling). The implementer must determine whether that
   branch is harmless-but-unreachable or actively wrong when this file is
   invoked from a Claude-side hook, and document the finding — not silently
   assume either way.
2. Exact shape of the runner parameter threading through
   `observeOnboardingAppServer`/`observeReadyAppServer` (new function
   parameter vs. reading from an already-available context object) is
   implementation latitude — the closed contract is the AC-3/AC-4 behavior,
   not the internal call signature.
3. **New, from readiness check:** `Bash`-matcher parity for the
   `guard-lifecycle-ready` gate (Codex's `codex-hooks.json` wiring covers
   both `Bash` and `Edit|Write`; this package's AC-8 covers `Edit|Write`
   only) is explicitly deferred — flag as a named follow-up in the
   implementer's report, do not fold it into this dispatch's scope.
