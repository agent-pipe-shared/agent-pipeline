# Prepared Goldfish briefing — CLAUDE-RUNNER-01i: fix the real F4 root cause and F3's remaining test bug

> **Status: READY TO DISPATCH.** Closes delta Critic findings F3 (still
> open — test bug) and F4 (still open — major residual) from the CLAUDE-
> RUNNER-01 round-2 delta review. Ruleset SHA: `48875cb` on
> `feat/sprint-cyborg-claude` (2026-07-27).
> **Worktree: no** — run directly in the main checkout.

---

You are a **Goldfish** of the Agent-Pipeline: fresh context, exactly ONE
task, "follow the plan exactly". This briefing and the files listed in
field 2 are your ONLY input. You have no memory and use none; do not read
handover/state files or session history — this briefing replaces them.

First output line (compact bootstrap confirmation):

> Bootstrap check passed: ruleset 48875cb loaded · Project agent-pipeline · Calibration .claude/pipeline.json · State briefing CLAUDE-RUNNER-01i/2026-07-27 · Role Goldfish

---

## Briefing CLAUDE-RUNNER-01i: the F4 fix from the prior round was one layer too shallow

### 0. What already happened (context, not your task to re-derive)

A prior round (commit `486b129`) made `guard-lifecycle-ready.mjs`'s
governance-marker resolution lazy and memoized
(`resolveGovernanceMarkers()`), invoked only inside
`evaluateLifecycleReadyGuard`'s existing try/catch. That closes the
*shape-invalid-manifest* subcase. It does **not** close the case the
finding actually named: `guard-lifecycle-ready.mjs` still has, at the top
of the file, a static import:

```js
import { loadRuntimeProjectionV3OwnedKeys } from "../lib/runtime-projection-v3.mjs";
```

and `runtime-projection-v3.mjs` itself performs an **eager, module-scope**
read+parse:

```js
// plugins/pipeline-core/lib/runtime-projection-v3.mjs:97-98
const FROZEN_OWNED_KEYS = frozen(JSON.parse(readFileSync(OWNED_KEYS_PATH, "utf8")));
const FROZEN_OWNED_KEYS_JSON = JSON.stringify(stableValue(FROZEN_OWNED_KEYS));
```

Merely **importing** `runtime-projection-v3.mjs` — which happens the
moment `guard-lifecycle-ready.mjs` is loaded, before any function in either
file runs — triggers this read. A missing, unreadable, or malformed
`plugins/pipeline-core/config/runtime-projection-v3-owned-keys.json` still
crashes at ES-module-evaluation time, before `main()` exists; node's exit 1
is defined by `hooks.json`'s own exit-semantics comment as "allow + config
warning". This is exactly the fail-open outcome the fix was meant to close,
one import hop deeper than where the prior fix looked. It is not narrow to
this hook either: `plugins/pipeline-core/hooks/codex-pretool-guard.mjs`
imports `runtime-projection-v3.mjs` **directly**, independent of
`guard-lifecycle-ready.mjs`, so the same crash risk exists there too via a
completely separate import path.

Separately, and unrelated to F4: the new end-to-end test added in the same
prior round
(`"the registered hook process allows a genuinely ready Claude project
through the real readiness chain"` in `guard-lifecycle-ready.test.mjs`) was
believed to be blocked purely by a Windows-only POSIX-permission
limitation. Re-running the exact same suite through a genuine Linux/WSL
Node install on this machine proved that belief wrong: the test still
fails on real POSIX, with `ReferenceError: existsSync is not defined` at
`guard-lifecycle-ready.test.mjs:775` — the test calls `existsSync` but the
file's `node:fs` import list at the top never included it. This is a
trivial bug, masked until now because the Windows-only wall was hit first
and the test never ran far enough to reach this line.

### 1. Goal — part A: make `runtime-projection-v3.mjs` load-safe (closes F4 for real)

Every use of `FROZEN_OWNED_KEYS` / `FROZEN_OWNED_KEYS_JSON` in the file
(lines 97-98, 108, 643, 682, 712-714, 732, 752-753 — confirm the exact
current line numbers yourself, they may have shifted) happens **inside
function bodies**, never at further module scope beyond the original
declaration. Convert the eager module-scope computation into a lazy,
memoized accessor and replace every bare reference with a call to it, so
that importing this file never touches disk — only actually *calling* a
function that needs the manifest does, and that call already happens
inside contexts (`isCommittedManifest()`, `projectValidatedIntent()`,
`planRuntimeProjectionV3()`, `readRuntimeProjectionV3Baselines()`) whose own
callers already handle their existing error/failure paths. Design latitude
on the exact shape (a single accessor returning both the parsed object and
its stable-JSON string, two separate accessors, a small memo object —
your call), with these hard requirements:

- Zero behavior change for every existing caller on the happy path (same
  committed manifest, same shipped `config/runtime-projection-v3-owned-keys.json`)
  — this is a load-timing change only, not a logic change. Prove this with
  the regression sweep in field 3.
- On a missing/unreadable/malformed manifest, the crash must now happen
  ONLY inside whichever function actually needed the manifest, at the
  moment it's called — never merely from importing the module. Write a new
  test in `runtime-projection-v3.test.mjs` (or extend an existing one)
  proving: (a) importing the module with the shipped `config/runtime-projection-v3-owned-keys.json`
  replaced by a genuinely missing file, or genuinely invalid JSON (not just
  wrong-shape-but-parseable — that subcase is already covered elsewhere),
  does NOT throw at import time; (b) calling one of the functions that
  needs the manifest DOES then surface the failure, through whatever error
  path is idiomatic for that function today (do not invent a new error
  shape — match each function's existing failure contract).
- `loadRuntimeProjectionV3OwnedKeys()` (the exported function, lines
  102-104) already reads fresh on every call and is NOT part of this
  problem — do not change its behavior, only the separate module-scope
  `FROZEN_OWNED_KEYS` constant.
- Existing default parameter `ownedKeyManifest = FROZEN_OWNED_KEYS` in
  `planRuntimeProjectionV3` (~line 732): if you convert `FROZEN_OWNED_KEYS`
  to a function call, this default expression naturally becomes
  `ownedKeyManifest = <yourAccessor>()`, which JS evaluates at call time,
  not definition time — confirm this actually behaves correctly (a test
  exercising the default-parameter path, not just an explicit-argument
  path).

### 2. Goal — part B: prove the whole hook process is load-safe end-to-end

Strengthen (do not replace) the existing subprocess test in
`guard-lifecycle-ready.test.mjs`,
`"the guard module still loads and the hook process fails closed on an
unusable shipped manifest"` — it currently only stages a **parseable JSON
with no usable target list** (structurally valid, wrong shape), which
exercises the subcase the PRIOR round's fix already covered. Add the
missing case(s) that exercise the TRUE crash path this finding named: a
staged `config/runtime-projection-v3-owned-keys.json` that is either
absent entirely, or contains genuinely invalid JSON (not merely
wrong-shaped-but-parseable). Confirm the real spawned hook process (same
technique already used in that test: stage a copy of the plugin's
`config`/`lib`/`scripts` directories minus test files, corrupt/remove the
config file, spawn the guard script as a real child process) still exits 2
(BLOCKED) rather than crashing with an uncaught exception (which would
surface as exit 1 with a stack trace in stderr, not the guard's own
sanitized `BLOCKED (guard-lifecycle-ready...)` message).

### 3. Goal — part C: fix F3's remaining bug and get genuine POSIX-green evidence

Add the missing `existsSync` import to
`guard-lifecycle-ready.test.mjs`'s `node:fs` import list (it already
imports `mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync,
symlinkSync, writeFileSync, cpSync` — `existsSync` is used at line ~775
inside the new ALLOW-path test but was never added to this list). This is
the ONLY defect currently known in that test; do not otherwise weaken,
skip, or platform-gate it.

**Then get real POSIX-green evidence, not an untested "would pass"
claim.** This machine has a portable Node v24.15.0 for Linux already
extracted (no sudo/root needed) inside its WSL Ubuntu distro at
`~/nodejs-portable/node-v24.15.0-linux-x64/bin`, reachable from a Windows
shell via:

```
wsl -e bash -c 'cd /mnt/d/Dev/agent-pipeline-share && export PATH="$HOME/nodejs-portable/node-v24.15.0-linux-x64/bin:$PATH" && node --test plugins/pipeline-core/hooks/guard-lifecycle-ready.test.mjs'
```

(adjust the repo path if your session's working directory differs — the
Windows path `D:\Dev\agent-pipeline-share` maps to `/mnt/d/Dev/agent-pipeline-share`
under WSL). Run the full `guard-lifecycle-ready.test.mjs` suite this way
after your fixes land. Expected result: **all 22 (or however many exist
after your part-B additions) tests pass, including the ALLOW-path test —
zero failures**, since both of the previously-known Windows-only
limitations (symlinkSync EPERM, git commit -S signing) do not apply on
real Linux, and your fixes close the remaining two. If anything still
fails on this genuine POSIX run, do NOT report it as "environment
limitation" without independently re-diagnosing it the same rigorous way
this briefing's own context was diagnosed — trace the real error, don't
assume.

Also re-run the same suite on this Windows machine directly
(`node --test plugins/pipeline-core/hooks/guard-lifecycle-ready.test.mjs`)
and confirm the result matches the two already-documented, already-accepted
Windows-only failures (symlinkSync EPERM in "governed consumer edits cannot
escape their physical project root"; git commit -S signing in "consumer
sessions cannot mutate Pipeline sources...") — nothing else should fail on
Windows either, now that the ALLOW-path test's own bug is fixed.

### 4. Regression sweep (mandatory — this touches a widely-shared library)

`runtime-projection-v3.mjs` is imported by at least: `project-onboarding-v3.mjs`,
`v3-bootstrap-authority.test.mjs`, `codex-project-runtime-readback-host.mjs`,
`runner-profile-migration-v3.mjs`, `codex-onboarding-runtime.mjs`,
`codex-pretool-guard.mjs`, `check-routing-projections.mjs`,
`plan-runtime-projection-v3.mjs`, `private-overlay-runtime-projection.mjs`
(confirm this list yourself — it may have grown). Run every test file for
every one of these consumers individually and confirm each is unchanged
from its own pre-existing baseline (a disposable-worktree comparison
against `48875cb` if any result looks even slightly different from what
you'd expect):
`runtime-projection-v3.test.mjs`, `project-onboarding-v3.test.mjs`,
`v3-bootstrap-authority.test.mjs`, `runner-profile-migration-v3.test.mjs`,
`codex-onboarding-runtime.test.mjs`, `codex-pretool-guard.test.mjs`,
`check-routing-projections.test.mjs`,
`private-overlay-runtime-projection.test.mjs`,
`guard-lifecycle-ready.test.mjs` (already covered above).

### 5. Context files

- `plugins/pipeline-core/lib/runtime-projection-v3.mjs` — the file with the
  real F4 root cause; read in full.
- `plugins/pipeline-core/lib/runtime-projection-v3.test.mjs` — existing
  coverage; extend per part A.
- `plugins/pipeline-core/hooks/guard-lifecycle-ready.mjs` — read-only
  context (should not need further changes, but verify — if your part-A
  fix changes what `resolveGovernanceMarkers()` needs to do, you may touch
  this file too, but only if actually necessary).
- `plugins/pipeline-core/hooks/guard-lifecycle-ready.test.mjs` — fix the
  import bug (part C) and strengthen the subprocess test (part B).
- `plugins/pipeline-core/hooks/hooks.json` — read-only, confirms the
  exit-semantics comment referenced above; do not modify.
- `plugins/pipeline-core/hooks/codex-pretool-guard.mjs` and its test —
  read-only regression check (part 4); do not modify the production file.

### 6. DoD checks

- `node --test plugins/pipeline-core/lib/runtime-projection-v3.test.mjs`
  exits 0, including your new load-safety test(s).
- `node --test plugins/pipeline-core/hooks/guard-lifecycle-ready.test.mjs`
  on Windows: only the 2 already-documented pre-existing failures remain.
- The SAME suite run via the WSL command in part C: **zero failures**.
  Paste the exact command and full output — this is your primary evidence
  for F3's closure.
- Full regression sweep from field 4: every listed consumer's test file
  individually exits with its own pre-existing baseline result, unchanged.
- Machine-written test output is your evidence artifact — never prose you
  compose.

### 7. Forbidden

- Scope: `plugins/pipeline-core/lib/runtime-projection-v3.mjs`,
  `plugins/pipeline-core/lib/runtime-projection-v3.test.mjs`,
  `plugins/pipeline-core/hooks/guard-lifecycle-ready.test.mjs`, and
  `plugins/pipeline-core/hooks/guard-lifecycle-ready.mjs` ONLY IF strictly
  necessary (state clearly in your report if you touched it and why). No
  other file — in particular, do NOT modify any of the consumer files
  listed in field 4, `hooks.json`, or `config/runtime-projection-v3-owned-keys.json`
  itself.
- Do NOT weaken, skip, delete, or platform-gate any existing test to force
  a green result.
- **Commit discipline:** never `git add -A` / a bare `git commit` — only
  an explicit pathspec naming exactly the files you touched.
- **Commit trailer:** end your commit message with the line `AI-Assisted: true`
  on its own line. Do NOT include any `Co-Authored-By`, `Claude-Session`, or
  other provider/session-identifying trailer (`guardrails/git.md` GIT-03).

### 8. Stop conditions

- More than 2 failed attempts at the same problem — report the failure
  state.
- The task requires touching a file outside field 7's scope — stop and
  report.
- Any consumer's regression test starts failing in a way you cannot
  resolve within budget — stop and report immediately, do not guess.
- The WSL command in part C doesn't work in your environment (e.g. WSL
  unavailable in this session) — report this plainly as a clean stop
  reason; do not fabricate a POSIX result.
- Missing access/tool/permission.
- Tool budget reached or clearly about to be exceeded.

### 9. Dispatch metadata

- Ruleset SHA/version: `48875cb` on `feat/sprint-cyborg-claude`.
- Model/effort: design-tier / xhigh (opus). Rationale: this touches a
  widely-shared library file underlying multiple security/architecture
  hooks (MP-07 criticality matrix) — same staffing tier as the original
  briefing-g.
- Worktree: no — run directly in the main checkout.
- Profile: standard.
- Tool budget: ≤40 tool uses (higher than usual: regression sweep across
  ~9 consumer test files plus a WSL invocation).
- Dispatch record: write `dispatch-record.json` to your own scratchpad
  location (not the repo), fields `taskId: "CLAUDE-RUNNER-01i"`, `model`,
  `rulesetSha`, `dispatcher`, `outcome`.

---

At the end, report back: the diff, the exact test commands you ran
(including the WSL invocation and its full output) and their exit codes,
the full regression sweep results, and confirm the commit SHA you produced
(or a clean stop with the reason, per field 8).
