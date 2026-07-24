# Prepared Goldfish briefing — PO-gate-authority path-canonicalization fix

> **Status: PREPARED, NOT YET DISPATCHED.** Authored as Elephant design-phase
> work per PO approval of decision D (Windows-slice sequencing, 2026-07-25).
> `planApproved` for `sprint-cyborg-epic` is still mechanically `false`
> (blocked by the confirmed `PO-PROFILE-RECEIPT-INVALID`, Bug 2 — see
> `docs/state.md`), so this briefing is prepared, not dispatched. Refresh the
> ruleset SHA in field 6 to the actual HEAD at dispatch time before sending.
> Windows-slice sequencing item 2 (`windows-sandbox-assurance-slice-scope.md`).
> **This fix is itself a prerequisite for recording `planApproved` on this
> host** — do not treat it as low-stakes cleanup.

---

You are a **Goldfish** of the Agent-Pipeline: fresh context, exactly ONE task,
"follow the plan exactly". This briefing and the files listed in field 2 are
your ONLY input. You have no memory and use none; do not read handover/state
files or session history — this briefing replaces them.

First output line (compact bootstrap confirmation):

> Bootstrap check passed: ruleset {{RULESET_SHA — fill with actual HEAD at dispatch}} loaded · Project agent-pipeline · Calibration .claude/pipeline.json · State briefing WIN-PGA-2/2026-07-25 · Role Goldfish

---

## Briefing WIN-PGA-2: fix native-Windows path-case mismatch in `resolvePoGateRepositoryTopology`

### 1. Goal

`resolvePoGateRepositoryTopology` (and the `assertPhysicalDirectory` helper it
depends on) in `plugins/pipeline-core/lib/po-gate-authority.mjs` must resolve
successfully on native Windows even when the calling process's current
working directory is cased differently from the disk-canonical casing of the
same physical path (e.g. a shell cwd of `d:\dev\agent-pipeline-share` when
the real on-disk casing is `D:\Dev\agent-pipeline-share`) — WITHOUT weakening
the function's actual safety property, which is: the resolved path must be a
real, non-symlinked physical directory, and it must genuinely be the same
directory git itself reports as the repository root/common-dir/worktree
roots (i.e. reject a TRUE mismatch — a different directory pretending to be
the repo root — exactly as strictly as today).

### 2. Context files

- `plugins/pipeline-core/lib/po-gate-authority.mjs` — the contract. Read, in
  this order: `assertPhysicalDirectory` (~line 103-111),
  `normalizeAbsolute` (locate and read its full body — not yet inlined here,
  find it near the top of the file), `gitObservation` (~line 299-317),
  `resolvePoGateRepositoryTopology` (~line 320-337, the function with the
  defect), and `validatePoGateAuthorityForRepository` (~line 340 onward, the
  production entry point that calls it).
- `backlog/items/2026-07-25-po-gate-authority-path-canonicalization.md` (the
  confirmed root-cause writeup and the proposal direction — read fully; do
  not re-derive the diagnosis from scratch).
- `harness/scripts/check-po-gate-authority.mjs` and the `approve-plan` path
  of `harness/scripts/pipeline-state.mjs` (consumers of this function — read
  only, to understand blast radius; out of scope to edit, see field 4).

Confirmed root cause (already isolated by direct reproduction, do not
re-derive): `resolvePoGateRepositoryTopology` computes `start =
assertPhysicalDirectory(realpathSync(resolve(repoRoot)))` from the caller's
current working directory, then separately computes `observedRoot` from
`git rev-parse --show-toplevel`'s own output (also passed through
`realpathSync`), and does a STRICT `observedRoot !== start` comparison. On
this host, a persistent shell whose cwd resets to a lowercase-cased path
(`d:\dev\agent-pipeline-share`) produces a `start` that keeps that casing
after `realpathSync`, while git's own `--show-toplevel` output resolves to
the disk-canonical casing (`D:\Dev\agent-pipeline-share`) — same physical
directory, different string — so the strict `!==` throws `"repository root
mismatch"` even though there is no real mismatch. Reproduced directly: the
identical call succeeded from a PowerShell session whose cwd was already
correctly-cased, and failed from a Bash session whose cwd was mis-cased,
against the identical repository state.

### 3. DoD checks

- AC: from a deliberately mis-cased working directory on native Windows
  (e.g. `d:\dev\agent-pipeline-share` when disk-canonical is
  `D:\Dev\agent-pipeline-share`, or the equivalent for wherever this repo is
  actually checked out at dispatch time — confirm the real on-disk casing
  yourself with a Windows directory-listing/`Get-Item`-equivalent call
  before writing the fixture), `resolvePoGateRepositoryTopology` resolves
  successfully and returns the SAME `repoRoot`/`gitCommonDir`/`primaryRoot`
  values it would from a correctly-cased cwd.
- AC: the function still THROWS when the two paths are genuinely different
  physical directories (not just differently cased) — write or keep a
  negative fixture proving this; do not let the fix silently accept two
  actually-different directories as equal.
- AC: all EXISTING tests for this file continue to pass unchanged (locate
  the test file for `po-gate-authority.mjs` first — it is not enumerated
  here on purpose; confirm its exact name/path yourself and do not assume
  one).
- AC: `node harness/scripts/pipeline-state.mjs approve-plan --by PO` no
  longer fails with `PO-GATE-AUTHORITY-UNAVAILABLE` when run from a
  mis-cased shell (it may still fail with a DIFFERENT, unrelated error —
  `PO-PROFILE-RECEIPT-INVALID` is a separate, already-tracked defect, not
  yours to fix; reaching that different, later error is itself a PASS for
  this task).
- Verify command: `node harness/scripts/verify.mjs` — the suite covering
  this file must pass; other pre-existing unrelated native-Windows reds are
  expected and out of scope (per `docs/state.md`'s documented baseline).
- Machine-written test/verify output is your evidence artifact — never
  prose you compose.

### 4. Forbidden

- Scope: touch ONLY `plugins/pipeline-core/lib/po-gate-authority.mjs` and its
  own test file (locate it; do not create a new one if one already exists).
  Any other file is out of scope — in particular, do NOT touch
  `harness/scripts/check-po-gate-authority.mjs` or
  `harness/scripts/pipeline-state.mjs` even though they consume this
  function.
- Do not weaken the mismatch check into a loose/best-effort comparison that
  would accept two genuinely different directories — the fix must be exact
  path-equality under a canonicalization that is case-insensitive ONLY where
  the underlying filesystem is (win32 drive-letter/segment casing), not a
  general fuzzy match.
- Do not attempt to fix `PO-PROFILE-RECEIPT-INVALID` (Bug 2) — that is a
  separate, already-tracked defect (`backlog/items/2026-07-25-po-gate-authority-receipt-readback.md`,
  folded into #35's scope) and explicitly out of scope here.
- No-go paths: `.claude/**`, `plugins/pipeline-core/hooks/**`.
- Project denies apply (committed `.claude/settings.json` / git-guard).
- **Commit discipline:** never `git add -A` / a bare `git commit` — only
  `git commit -- <own paths>`; new files need `git add -- <path>` (pathspec)
  before the commit, same paths in both.

### 5. Stop conditions

- More than 2 failed attempts at the same problem — report the failure
  state.
- The fix cannot be made without touching a consumer file (field 4's no-go
  list) — stop and report; that would mean the defect is bigger than
  currently scoped, which is new information the Elephant needs.
- Any test outside this file's own suite starts failing because of this
  change — stop and report immediately, do not attempt to fix the
  regression yourself.
- The negative "genuinely different directories still throw" fixture cannot
  be made to pass alongside the case-insensitive fix — stop and report; do
  not ship a version that silently drops that safety property.
- Missing access/tool/permission.
- Genuine ambiguity the briefing does not resolve.
- Tool budget reached or clearly about to be exceeded.

### 6. Dispatch metadata

- Ruleset SHA/version: `{{FILL AT DISPATCH TIME — current HEAD}}` (this
  briefing was authored against `7f54f6d83739691679af2238f5bc3f79d2e24359`;
  do not dispatch against a stale SHA without refreshing this field).
- Model/effort: the implement-tier model / medium (`goldfish-implementor`).
  Deviation consideration: this touches trust/authority-boundary code
  (`po-gate-authority.mjs` gates a PO-approval recording path) — if the
  actual diff turns out to require non-trivial judgment about the
  canonicalization primitive's security properties, escalate to
  `goldfish-deep`/xhigh per MP-05 rather than force it through at the
  implementor tier; note that escalation decision explicitly in the final
  report if taken.
- Worktree: no — single file pair, no parallel-dispatch conflict risk
  expected in isolation (confirm against calibration `.claude/pipeline.json`
  `"worktree": "optional"` at actual dispatch time).
- Profile: standard (this is guardrail/authority-adjacent code, not
  `light`-eligible per operating-model §3.3).
- Tool budget: ≤35 tool uses.
- Dispatch record: write `dispatch-record.json` next to the evidence
  artifact per the standard template fields (`taskId: "WIN-PGA-2"`, `model`,
  `rulesetSha`, `dispatcher`, `outcome`).

---

## BUGFIX module (applies per template)

- Reproduce-first: reproduce the mis-cased-cwd failure yourself (e.g. by
  invoking the function or the CLI path from a deliberately mis-cased
  working directory) and confirm the exact `"repository root mismatch"`
  error BEFORE writing any fix — this is your RED baseline evidence.
- Root-cause-only: fix only the path-canonicalization comparison. No
  incidental cleanup of the rest of the file.
- Renames separate: if the fix suggests extracting a shared canonicalization
  helper, that is fine to do WITHIN this file's scope (still one file), but
  do not rename or restructure exported function signatures other consumers
  rely on — check call sites in the context files above first.
- Repro stays in the suite: both the mis-cased-cwd positive fixture and the
  genuinely-different-directory negative fixture are permanent regression
  coverage, not scratch checks to remove after.
