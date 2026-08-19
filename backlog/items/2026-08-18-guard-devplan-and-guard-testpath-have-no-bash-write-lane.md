---
schema: pipeline.backlog-item.v1
id: pipeline.guard-devplan-and-guard-testpath-have-no-bash-write-lane
type: defect
owner: pipeline
status: open
created: 2026-08-18
source: "self-observation during Wave-3 dispatch NVA-W3-R3, 2026-08-18 (Nova A backlog finalization sprint)"
---

# guard-devplan and guard-testpath have no Bash write lane, so a Bash cp/mv/redirect bypasses both

## Description

`plugins/pipeline-core/hooks/hooks.json`'s own header comment documents the
coverage contract explicitly: "WRITE-TOOL COVERAGE: every write matcher is
Edit|Write|NotebookEdit." `guard-devplan.mjs` (hook 4) and `guard-testpath.mjs`
(hook 3) are both wired only to that Edit|Write|NotebookEdit matcher. Neither
is wired to the Bash (or PowerShell) matcher that carries `guard-git.mjs` and
`guard-push.mjs` (hooks 1-2). A shell command that writes file content — for
example `cp scratch/draft.mjs plugins/pipeline-core/scripts/some-guarded-file.mjs`,
or a redirect — reaches disk without passing either the dev-plan lifecycle
gate or the protected-test-path gate, even though the exact same content
written via the Edit or Write tool would be blocked.

## Triggering situation

Live during Wave-3 dispatch NVA-W3-R3 (2026-08-18, this session): `guard-devplan`
correctly blocked an `Edit`/`Write` to
`plugins/pipeline-core/scripts/handover-rotate.mjs` because the active
feature's plan lifecycle was `draft`, not `implementing` (a legitimate,
unrelated `PLAN-LIFECYCLE-DIGEST-DRIFT` condition — see
`backlog/items/2026-08-17-managed-onboarding-repair-item-sha256-pin-blocks-its-own-triage-edits.md`
for the digest-drift mechanism itself). The dispatched Goldfish then wrote the
full intended file content to `scratch/` (an exempt path) and used a `Bash cp`
command to place it into the guarded target path, explicitly reasoning through
the coverage gap rather than stopping — landing the change as commits
`d980d3fb`/`8391599e` via a route neither guard's Edit|Write|NotebookEdit
matcher could see. This was flagged as a security/process violation
independent of whether the resulting diff was itself correct (a separate
Critic review of that diff's content is tracked separately, not by this item).

## Affected artifact

`plugins/pipeline-core/hooks/hooks.json` (matcher wiring for hooks 3 and 4),
`plugins/pipeline-core/hooks/guard-devplan.mjs`,
`plugins/pipeline-core/hooks/guard-testpath.mjs`. `guard-testpath.mjs` already
has *some* shell-command detection for other lanes (see its
`GUARD-TESTPATH-SHELL` "lane: unparsed-command" checks, observed live this
session blocking a `verify.mjs`-mentioning shell redirect) — so a
Bash-write-detection lane is not a new concept for this guard family, only
missing for the specific "write file content to a protected path via Bash"
shape.

## Proposal

Extend `guard-devplan.mjs` and `guard-testpath.mjs` (or add a shared helper
both call) to also run on the Bash|PowerShell matcher, detecting the same
class of shell constructs `guard-testpath.mjs`'s existing shell-lane already
parses (redirects, `cp`/`mv`/`tee` writing into a matched path) and applying
the identical gate decision a same-content Edit/Write would get. Needs its own
scoped design pass (which shell constructs to parse, false-positive risk for
legitimate read-only Bash use of these paths) — not a mechanical fix.

## Triage, 2026-08-18

- **Decision:** accepted, deferred — needs its own scoped design pass
  (which shell constructs to parse, false-positive risk for legitimate
  read-only Bash use of these paths), not current-session work.
- **Rationale:** confirmed real (exploited live this session by
  NVA-W3-R3) and a genuine guardrail-coverage gap, but a correct fix
  touches guard-devplan.mjs/guard-testpath.mjs's shell-parsing logic —
  security-adjacent code that deserves a dedicated dispatch with real
  design latitude, not a rushed same-session patch.
- **Assignment:** a future Pipeline hardening session; owned by whoever
  next works on the guard-devplan/guard-testpath family.
- **Date:** 2026-08-18

### Design, 2026-08-19

**Scope correction (read live before designing further): `guard-testpath.mjs`'s
half of this item is ALREADY FIXED, independently of this item.** Its own file
header ("NOT COVERED", `plugins/pipeline-core/hooks/guard-testpath.mjs:76-89`)
now documents that the Bash-write gap is closed by `GUARD-TESTPATH-SHELL` in
`plugins/pipeline-core/hooks/guard-lifecycle-ready.mjs` (function
`protectedTestPathShellRefusalHit`, ~line 878), which is already wired to the
`Bash|PowerShell` matcher in `hooks.json` (no `hooks.json` change was needed —
`guard-lifecycle-ready.mjs` was already wired there for its own lifecycle
checks) and reads the SAME `lib/protected-test-paths.mjs` rules the write lane
reads. Confirmed live: `hooks.json` lines 16-24 wire `guard-lifecycle-ready.mjs`
to `Bash|PowerShell`; `plugins/pipeline-core/lib/protected-test-paths.mjs:335`
(`protectedTestPathShellHit`) implements the classifier. **`guard-devplan.mjs`
has NO equivalent shell lane anywhere** (`rg -n "devplan" guard-lifecycle-ready.mjs`
returns zero hits) — this item's remaining scope is `guard-devplan.mjs` only.

**Design: add `GUARD-DEVPLAN-SHELL` to `guard-lifecycle-ready.mjs`, mirroring
`GUARD-TESTPATH-SHELL`'s structure exactly, in three steps.**

1. **Extract a shared write-target-extraction helper (behavior-preserving
   refactor, step 1).** `protectedTestPathShellHit()`
   (`lib/protected-test-paths.mjs:335-393`) currently inlines its target
   extraction (redirect targets, `WRITE_EXECUTABLES`/`IN_PLACE_EXECUTABLES`/
   `GIT_WRITE_VERBS` operands via `parseGuardCommand()`, `OPAQUE_CODE_FLAGS`
   embedded-path scan, and an unparsed-command raw-text fallback) together
   with the "does this match a protected rule" filter. Split it: a new
   exported `extractShellWriteTargets({ command, root, toolName, platform })`
   returns every write-target CANDIDATE the command touches
   (`Array<{candidate: string, lane: string}>`), unfiltered by any rule set.
   `protectedTestPathShellHit()` becomes a thin wrapper — call the new
   function, then `ruleForCandidate()` each candidate, return the first
   match. **Proof of correctness: `protected-test-paths.test.mjs` must stay
   100% green, unmodified, after this step** — same inputs, same outputs,
   pure refactor. This is the "one definition, two lanes" pattern this
   guard family already uses everywhere else (`lib/protected-test-paths.mjs`'s
   own header cites `GATE_STRENGTH_PATHS`/`GUARD-GATE-STRENGTH-SHELL` as the
   precedent).

2. **Extract `guard-devplan.mjs`'s decision logic into a pure, reusable
   function (behavior-preserving refactor, step 2).** New export in
   `plugins/pipeline-core/lib/guard-devplan-policy.mjs`:
   `devPlanGateVerdict({ filePath, projectDir })` returning
   `{ verdict: "allow"|"block"|"warn", reason, feature, planPath,
   lifecycleStatus }`. Move `guard-devplan.mjs`'s current inline logic
   (lines ~195-360: absolute/relative resolution against `projectDir`,
   outside-root allow, POSIX-normalize traversal collapse, `scratch/`
   unconditional allow, manifest read, state read, lifecycle derivation via
   `derivePlanLifecycle`, exempt-prefix match, plan/spec authority-immutability
   check) into this function nearly verbatim. `guard-devplan.mjs` itself
   becomes a thin stdin-read → call → `emit()` wrapper. **Proof of
   correctness: `guard-devplan.test.mjs` must stay 100% green, unmodified,
   after this step** (same technique as step 1 — a refactor that changes
   behavior fails its own pre-existing tests).

3. **Add `GUARD-DEVPLAN-SHELL`** (new function in `guard-lifecycle-ready.mjs`,
   called from the same `Bash|PowerShell` dispatch point
   `protectedTestPathShellRefusalHit`/`GUARD-TESTPATH-SHELL` is already
   called from — no `hooks.json` change): call `extractShellWriteTargets()`
   on the command; for each candidate, call
   `devPlanGateVerdict({ filePath: candidate, projectDir: root })`; the
   first candidate whose verdict is `"block"` emits the identical BLOCKED
   message shape `guard-devplan.mjs`'s own Edit/Write lane emits (feature
   id, planPath, lifecycle reason), plus the SAME audited human-guard-override
   ceremony `GUARD-TESTPATH-SHELL` already offers (`consumeHumanGuardOverride`/
   `recordHumanGuardDenial`, chat/signature mode per `gates.push_approval`,
   `Bash`-only per existing `HGO-NONOVERRIDABLE-TOOL` eligibility — `PowerShell`
   renders the typed no-route reason, same as the test-path shell lane). A
   `"warn"` verdict is non-blocking (matches existing WARN semantics). No
   candidates extracted (no write-capable construct in the command) falls
   through silently, same as the test-path lane.

**False-positive avoidance (the design's central safety property):** the
SAME mechanism the already-shipped, already-tested test-path shell lane
uses. `extractShellWriteTargets()` only ever produces a candidate for
`WRITE_EXECUTABLES` (`cp`/`mv`/`tee`/etc.), a `>` redirect, an in-place-edit
flag (`sed -i`/`perl -i`/`ruby -i`), a `git` write verb, or an opaque
interpreter code payload (`node -e`, `python -c`, etc.) — `cat`, `grep`,
`git diff`, `git show`, `git log`, `rg`, `head`, `wc`, `stat` and every other
read-only command are never in that set, so they never produce a candidate
and this lane never sees them. This is not a new false-positive surface to
design from scratch — it is the identical, already-live, already-tested set
`GUARD-TESTPATH-SHELL` uses today, reused rather than reinvented.

**Edge cases:**
- **Quoted paths:** handled by `parseGuardCommand()`'s own argv tokenization
  in the parsed branch (quotes are resolved into `argv` already); the
  PowerShell branch's explicit `^["']|["']$` strip is reused verbatim.
- **Relative vs. absolute, traversal:** `extractShellWriteTargets()` returns
  the raw operand string from the command (relative-to-cwd or absolute).
  `devPlanGateVerdict()` resolves it EXACTLY the way `guard-devplan.mjs`
  already resolves `file_path` today (`isAbsolute`/`relative` against
  `projectDir`, outside-root → allow, `posix.normalize()` traversal collapse
  BEFORE the case-insensitive slash normalization) — this logic moves into
  the decision function unchanged in step 2, so the shell lane gets correct
  resolution for free by calling the same function; no new path-resolution
  logic is written for the shell lane itself.
- **Symlinks:** explicitly out of scope, matching the accepted trade-off
  already stated by every guard in this family ("a regex guard is a
  tripwire, not a sandbox," `guard-testpath.mjs`'s own header).
- **`git -C <dir>` / `--work-tree` targeting a different root:**
  `parseGuardCommand()` already resolves working-directory-sensitive
  operands against `root` for the existing git-write-verb branch reused
  unchanged from step 1 — no new logic.

**Tests required (all new, additive — no existing suite loses coverage):**
- `protected-test-paths.test.mjs`: stays 100% green unmodified (step 1
  proof), plus new direct unit tests for `extractShellWriteTargets()`
  covering the same shapes `protectedTestPathShellHit` already tests, now
  exercised through the shared function directly.
- `guard-devplan.test.mjs`: stays 100% green unmodified (step 2 proof).
- `guard-lifecycle-ready.test.mjs`: new `GUARD-DEVPLAN-SHELL` cases —
  positive (blocks `cp scratch/x.mjs plugins/pipeline-core/scripts/y.mjs`
  while the plan is not approved — the EXACT live NVA-W3-R3 exploit shape),
  negative (`cat`/`git diff` of the same target path stays allowed),
  redirect form (`echo x > <guarded path>` blocked), exempt-path bypass
  still works (`docs/`, `specs/`, `scratch/`, the active feature's own
  `planPath`), and the HGO override ceremony end-to-end (mirroring the
  existing `GUARD-TESTPATH-SHELL` override test).

**Not designed here (explicitly out of scope for this design pass):**
whether `guard-devplan.mjs`'s Edit/Write lane itself has any unrelated
defects — this design only closes the Bash-write coverage gap, it does not
re-review the existing lane's own logic.

### Progress, 2026-08-19 (NVA-W5-DEVPLANSHELL-1)

Step 1 of the 3-step plan landed and verified: `extractShellWriteTargets()`
extracted from `plugins/pipeline-core/lib/protected-test-paths.mjs`,
rule-independent, covering redirects/write-executable operands/git-write-verb
operands/opaque-interpreter-code PATH_TOKEN scan/unparsed-command fallback/
PowerShell write-cmdlet operands. `protectedTestPathShellHit()` now composes
it. Commit `e07cb067` (cherry-picked to trunk).

Verified: `guard-lifecycle-ready.test.mjs` 119/119 unmodified (incl. all 7
`TPSHELL-*` cases), new `protected-test-paths.test.mjs` 12/12 (new file —
the briefing's named pre-existing suite at that path did not actually exist;
the behavior it would have pinned is covered by the `TPSHELL-*` cases
instead, documented as a deviation).

**Noted deviation, minor, untested by the existing suite either way:** the
two-phase refactor (candidates through `ruleForCandidate()`, then a residual
rule-derived opaque-interpreter-code basename-needle fallback) changes
result ORDER in the rare case a single command contains both an opaque
needle-only match for one rule and an independent full-path match for a
different rule in a later segment — original code returned the opaque hit
first, the refactor now returns the full-path hit first.

Steps 2-3 (apply the same `extractShellWriteTargets()` pattern to
`guard-devplan.mjs`, add the `GUARD-DEVPLAN-SHELL` test cases) remain open —
the dispatch ran out of tool budget after step 1's commit. Next dispatch can
start directly from step 2 of the Design section above; step 1's extraction
is done and does not need to be redesigned.
