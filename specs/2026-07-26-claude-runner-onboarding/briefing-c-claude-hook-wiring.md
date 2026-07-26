# Prepared Goldfish briefing — CLAUDE-RUNNER-01c: Claude-side `guard-lifecycle-ready` wiring

> **Status: NOT YET DISPATCHED — depends on CLAUDE-RUNNER-01a and
> CLAUDE-RUNNER-01b landing and verifying first** (this task wires the
> lifecycle-readiness gate that (a)/(b) made runner-conditional; it does not
> itself change lifecycle logic). Do not dispatch this briefing until both
> land and their own DoD checks pass. PO gate answered "freigeben" for
> `prd_claude-runner-onboarding.md`/`spec.md` (2026-07-26, recorded in
> `docs/state.md`), which explicitly includes AC-8 (this task) and the PRD's
> Decision point 1 ("ja, gleichwertige Durchsetzung für den `Edit|Write`-Fall").
> Ruleset SHA placeholder: refresh to (b)'s landing commit before dispatch.
> **Worktree: no** — run directly in the main checkout, same reasoning as
> (a)/(b).
>
> **`hooks.json` protection note:** `plugins/pipeline-core/hooks/hooks.json`
> is TP-4-protected per `.claude/guard-config.json`
> ("no ad-hoc edits outside a briefed test-change task"). This IS such a
> briefed task — the PO-approved Spec (§4 item 7) explicitly names this file
> and this exact change. You are authorized to edit it. This note exists so
> you do not treat the file's own header comment as a reason to stop; it is
> not — a stop would be the WRONG response here. If your guard tooling
> nevertheless blocks the edit at apply time, report that as a tooling
> friction finding, not a scope violation.

---

You are a **Goldfish** of the Agent-Pipeline: fresh context, exactly ONE task,
"follow the plan exactly". This briefing and the files listed in field 2 are
your ONLY input. You have no memory and use none; do not read handover/state
files or session history — this briefing replaces them.

First output line (compact bootstrap confirmation):

> Bootstrap check passed: ruleset <REFRESH-SHA> loaded · Project agent-pipeline · Calibration .claude/pipeline.json · State briefing CLAUDE-RUNNER-01c/2026-07-26 · Role Goldfish (deep)

---

## Briefing CLAUDE-RUNNER-01c: wire `guard-lifecycle-ready` enforcement into Claude's own hook chain

### 1. Goal

Per `specs/2026-07-26-claude-runner-onboarding/spec.md` (read this file
FULLY first) §2 Technical Plan and §4 items 6-7, AC-8:

Codex enforces `requireProjectOnboardingReady()` (from
`project-onboarding-ready-gate.mjs`) today via
`hooks/codex-pretool-guard.mjs`, which is registered in
`hooks/codex-hooks.json` on BOTH its `Bash` matcher and its
`apply_patch|Edit|Write` matcher; `codex-pretool-guard.mjs` calls
`evaluateLifecycleReadyGuard()` (exported from `guard-lifecycle-ready.mjs`)
as an in-process function import — `guard-lifecycle-ready.mjs` is never
itself directly registered as a standalone hook entry anywhere today.

**Corrected scope (confirmed during this package's readiness check — do not
assume a simpler "just copy the Codex registration" task):** there is no
existing "register `guard-lifecycle-ready.mjs` as a hook" pattern to copy.
You are building a new, Claude-side registration. The closed contract (AC-8)
is: an Edit/Write tool call in a Claude Code session against a
Pipeline-governed root must be subject to the SAME `requireProjectOnboardingReady`
gate that Codex's `Edit|Write` matcher already enforces via its own path.
**Scope for this package is `Edit|Write` only** — Codex's enforcement also
covers `Bash` (for sanctioned-lifecycle-command detection); that parity is
explicitly OUT of scope here (Spec §2, Open item 3) and must be named as a
follow-up in your report, not silently added or silently ignored.

Two reasonable shapes exist for how to do this (your implementation
latitude — pick one, document why):
(i) register `guard-lifecycle-ready.mjs` directly as a new hook entry in
`hooks/hooks.json`'s existing `Edit|Write` matcher (alongside
`guard-testpath.mjs`/`guard-devplan.mjs`), if the file can run standalone as
a hook script (check whether it has/needs a `main`-style CLI entry point —
`codex-pretool-guard.mjs` currently owns that role for Codex); or
(ii) create a new, thin Claude-facing hook script (e.g.
`claude-pretool-lifecycle-guard.mjs`) that imports and calls
`evaluateLifecycleReadyGuard()` the same way `codex-pretool-guard.mjs` does,
and register THAT in `hooks.json` — mirroring the actual existing pattern
(a thin per-runner adapter script that imports the shared guard function)
rather than assuming `guard-lifecycle-ready.mjs` itself is hook-shaped.

**A specific open question you must resolve and document, not silently
pick a side on:** `guard-lifecycle-ready.mjs` imports
`hasCodexExistingGitControlMount`/`readCodexHostRepositoryInitAdmission`
from `codex-host-layout.mjs` and uses them in a Codex-sandbox-specific
fallback branch (search the file for this — it is documented in its own
comments as Codex-sandbox-specific). Determine whether this branch is
harmless-but-unreachable when invoked from a Claude-side hook context, or
whether it would produce a wrong result under Claude — and say which, with
your reasoning, in your report. Do NOT silently assume either way.

### 2. Context files

- `specs/2026-07-26-claude-runner-onboarding/spec.md` (read FULLY) — your
  primary technical authority. §2 Technical Plan (guard-lifecycle-ready
  parity paragraph), §4 items 6-7, §5 AC-8, §6 DoD, "Open items carried into
  dispatch briefings" section (items 1 and 3 specifically).
- `specs/2026-07-26-claude-runner-onboarding/prd_claude-runner-onboarding.md`
  (read for product framing — specifically Decision point 1's approved
  resolution: yes to Edit/Write parity, Bash parity explicitly deferred).
- `plugins/pipeline-core/hooks/guard-lifecycle-ready.mjs` (read fully, 478
  lines) — the guard logic itself. Study `evaluateLifecycleReadyGuard()`'s
  exact signature/return shape, and the Codex-sandbox-specific fallback
  branch mentioned above.
- `plugins/pipeline-core/hooks/guard-lifecycle-ready.test.mjs` (read fully,
  541 lines) — existing test suite; study fixture style, you will extend
  this file.
- `plugins/pipeline-core/hooks/codex-pretool-guard.mjs` (read fully, 193
  lines) — the CURRENT real precedent: study exactly how it wires stdin
  parsing, calls `evaluateLifecycleReadyGuard()`/`isSanctionedLifecycleCommand()`,
  and emits its PreToolUse response shape. This is Codex's response format
  (`hookSpecificOutput.hookEventName/permissionDecision/permissionDecisionReason`)
  — confirm whether Claude Code's own hook protocol expects the same shape
  or a different one (check `guard-testpath.mjs`/`guard-devplan.mjs` for
  Claude's actual expected exit-code/stdout contract — Claude's existing
  hooks use a different protocol than Codex's, per `hooks.json`'s own header
  comment: "Exit semantics of all PreToolUse guards: 0 allow, 2 block
  (stderr to the agent)" — do NOT assume Codex's JSON-stdout shape applies
  to a Claude-side hook; verify against Claude's real existing hooks).
- `plugins/pipeline-core/hooks/guard-testpath.mjs` and
  `plugins/pipeline-core/hooks/guard-devplan.mjs` (read fully) — these are
  Claude's REAL existing `Edit|Write` hooks, the actual pattern your new
  registration must match (exit-code semantics, stdin/argv handling,
  fail-open discipline) — more relevant precedent for Claude-side wiring
  than `codex-pretool-guard.mjs` is.
- `plugins/pipeline-core/hooks/hooks.json` (read fully) — the file you
  modify (TP-4-protected, see the authorization note above). Study its
  existing `Edit|Write` matcher entry and its header comment's numbered
  hook descriptions — your new entry needs a corresponding numbered
  description added to that header comment (the file's own convention).
- `plugins/pipeline-core/hooks/codex-hooks.json` (read fully) — Codex's
  parallel wiring file, for comparison only; you are not modifying this
  file.
- `plugins/pipeline-core/lib/codex-host-layout.mjs` (read the
  `hasCodexExistingGitControlMount`/`readCodexHostRepositoryInitAdmission`
  exports only) — to answer the open question above about
  `guard-lifecycle-ready.mjs`'s Codex-sandbox-specific fallback branch.
- `.claude/guard-config.json` (read fully, short file) — confirms the TP-4
  protection scope and reasoning.

### 3. DoD checks

- AC-8: an Edit/Write tool call targeting a Pipeline-governed root under a
  Claude Code session enforces the same `requireProjectOnboardingReady` gate
  Codex already enforces via its own `Edit|Write` matcher — write a test
  that exercises your new hook entry point directly (not just the
  underlying `evaluateLifecycleReadyGuard()` function in isolation, which
  (a)'s/existing tests already may cover) and confirms it blocks when the
  lifecycle is not ready and allows when it is, using Claude's actual
  exit-code/stdout hook contract (not Codex's JSON-stdout shape, unless you
  confirm during investigation that Claude's protocol also accepts that
  shape — verify, don't assume).
- Your chosen registration shape (direct `guard-lifecycle-ready.mjs`
  registration vs. a new thin adapter script) is documented with reasoning
  in your report.
- The Codex-sandbox-specific fallback branch question (see Goal, "specific
  open question") is answered explicitly in your report, with the reasoning
  that led to your conclusion.
- `hooks.json`'s header comment gets an updated/added numbered hook
  description for your new entry, consistent with the file's existing
  convention (it currently documents 8 hooks by number — yours becomes a new
  numbered entry or an explicit sub-point of the existing `Edit|Write`
  entry, your call, documented).
- Every pre-existing test in `guard-lifecycle-ready.test.mjs` passes
  unchanged.
- Verify command:
  `node --test plugins/pipeline-core/hooks/guard-lifecycle-ready.test.mjs`
  (plus your new hook script's own test file, if you created one under
  option (ii)) exits 0.
- Full regression against (a)+(b)'s files: also re-run
  `node --test plugins/pipeline-core/lib/project-onboarding-v3.test.mjs`,
  `node --test plugins/pipeline-core/lib/project-onboarding-ready-gate.test.mjs`,
  `node --test plugins/pipeline-core/lib/codex-onboarding-app-server.test.mjs`,
  `node --test plugins/pipeline-core/scripts/v3-bootstrap-authority.test.mjs`
  — all must still exit 0 (proves (a)+(b)+(c) compose correctly).
- Do NOT run the full `node harness/scripts/verify.mjs` — same reasoning as
  (a)/(b)'s briefings; the full aggregate run is its own dedicated later
  step (Task #8).
- Machine-written test output is your evidence artifact — never prose you
  compose.

### 4. Forbidden

- Scope: modify ONLY `plugins/pipeline-core/hooks/hooks.json`,
  `plugins/pipeline-core/hooks/guard-lifecycle-ready.mjs` (only if a minimal
  change is needed to make it directly hook-registrable — document if you
  touch it at all, keep changes minimal),
  `plugins/pipeline-core/hooks/guard-lifecycle-ready.test.mjs`. You may
  CREATE one new thin adapter hook script (e.g.
  `plugins/pipeline-core/hooks/claude-pretool-lifecycle-guard.mjs`) plus its
  own test file, if you choose registration shape (ii). No other file.
- Do NOT add `Bash`-matcher parity — explicitly out of scope (see Goal).
- Do NOT modify `codex-pretool-guard.mjs`, `codex-hooks.json`,
  `project-onboarding-v3.mjs`, `project-onboarding-ready-gate.mjs`,
  `codex-onboarding-app-server.mjs`, `v3-bootstrap-authority.mjs`,
  `codex-onboarding-runtime.mjs` — these belong to (a)/(b), already landed.
- Do NOT modify `codex-host-layout.mjs` — read-only investigation for the
  open question above, no changes.
- Do NOT touch any file under `guardrails/**`, `roles/**`, `docs/adr/**`.
- No-go paths: `.claude/**` (note: `.claude/guard-config.json` is a CONTEXT
  file to read, you are not editing it).
- Project denies apply (committed `.claude/settings.json` / git-guard).
- **Commit discipline:** never `git add -A` / a bare `git commit` — only
  `git commit -- <own paths>`; new files need `git add -- <path>` before
  commit, same paths in both.

### 5. Stop conditions

- More than 2 failed attempts at the same problem — report the failure
  state.
- The task requires touching a file outside field 4's scope — stop and
  report.
- Any pre-existing test outside your own new/modified assertions starts
  failing and you cannot determine why within budget — stop and report
  immediately.
- You determine Claude Code's actual hook protocol cannot express a
  "block" decision the way you expected (e.g. neither exit-code nor
  JSON-stdout achieves it) — stop and report this as a finding, do not ship
  a hook that silently fails open when it should block.
- The TP-4 guard tooling blocks your edit to `hooks.json` despite the
  authorization note above — stop and report this as a tooling-friction
  finding (not a scope violation), do not attempt to bypass a guard.
- Missing access/tool/permission.
- Tool budget reached or clearly about to be exceeded.

### 6. Dispatch metadata

- Ruleset SHA/version: refresh to (b)'s landing commit SHA before dispatch —
  placeholder, do not dispatch unrefreshed.
- Model/effort: `goldfish-deep` / xhigh. Rationale: rigor 2 / risk class
  high per Spec header; this task modifies a TP-4-protected guard-wiring
  file and makes a genuine design call (registration shape) with real
  security-relevant consequences (a wrong hook contract could silently fail
  open).
- Worktree: no — run directly in the main checkout.
- Profile: standard.
- Tool budget: ≤45 tool uses.
- Dispatch record: write `dispatch-record.json` to your own scratchpad
  location (not the repo), fields `taskId: "CLAUDE-RUNNER-01c"`, `model`,
  `rulesetSha`, `dispatcher`, `outcome`.

---

At the end, report back: the diff summary, your registration-shape choice
and why, your answer to the Codex-sandbox-fallback-branch question and why,
the exact test commands you ran and their exit codes/output, and confirm
the commit SHA you produced (or a clean stop with the reason, per field 5).
