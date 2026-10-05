# Held notes (persist into tracked files after the open override ceremony returns)

## PO answers at the final design approval (2026-10-04, chat) — persist in W0-0 (po-queue + design-input #17–#20)

Readiness ALFRED-READINESS-20261004-R4 = ready-for-po-review (package 826f1374…, candidate ae7ef5a2).
unresolvedChoices answered:
- PO-ADVISOR-EXCEPTION: one-time Advisor-unavailable exception ACCEPTED (Claude Advisor route built in R4).
- PO-ANTIGRAVITY-AVAILABILITY: decision #14 governs Antigravity Critic/plan-verifier (hook-observed subagent,
  unavailable until measured); the PO's AC-32 Antigravity host run (P-5) counts as that measurement. #3 still
  enables Antigravity readiness/Advisor routes.
- PO-D-TRACK-CEREMONY-CLASS: one-time onboarding approvals for setup topics are fine; the single design
  signature covers the design, not onboarding. The model check runs in every session but rarely finds a new
  version (automatic, no PO touch unless a family switch).
- PO-WATERMARK-OUTAGE: refuse (typed, with handoff) until the previously selected release is back; "newest not
  selectable before first use" still uses the older selectable release.
Non-blocking readiness findings to fold into W0-0/plan: Codex Critic/plan-verifier mechanism unnamed; PRD §5 wave
order lags Spec §21.7 (E4 has no wave); recovery CLI artifact provenance; stale counts/markers; macOS parity
without host evidence; acceptance.md not in the package.

## PO decision (2026-10-03, chat, latest — supersedes the two below): revise the five sources now

- Trigger: independent readiness (probe, `scratch/readiness-not-ready-report-20261003.json`) = not-ready,
  4 blocking; a not-ready receipt can never form a package (`DWP-READINESS-BINDING`), so route 2 is dead.
- PO "ja" to: fold Rev-2 drafts into PRD/Spec/design/traceability/input before approval, with Elephant
  defaults for the 4 blockers (PO may overrule at final approval):
  (1) no post-approval binding doc; (2) fallback self-dispatch never satisfies readiness or Critic, at most
  a labelled Advisor substitute; (3) R1-4 scratch-script admission dropped, stays fail-closed, denial text
  names the `!` route; (4) every signature-mode push needs a signature; "two approvals" = plan + one per
  push in the single-push happy path; key setup/TOFU/enrollment = one-time onboarding acts outside the count.
- Parallel: hotfix 7 (schema metadata strip) package; read-only research on the Claude revision path
  (reopen-design, new Advisor course after HEAD change, DACS rules, authoring dispatch continuity).

## PO decision update (2026-10-03, chat): approve Rev. 1 with binding obligations (SUPERSEDED)

- Hotfix-4 trace: on Claude no design revision is possible after the Advisor stage (package/readiness
  bind HEAD to the Advisor course's initial candidate; one-cycle rule; `--revisions` Codex-only) → new
  register row K5-7 (to add after present-plan).
- PO chose: present Rev. 1 (HEAD ec7183dd); the Advisor findings + revision drafts go into the
  exception rationale as binding obligations; first post-approval WP W0-0 commits
  `scratch/revision-draft/*` as `specs/sprint-alfred-epic/design/findings-round-revision-2.md`
  (binding over Spec §21 rev 1 where it is more precise); folded into PRD/Spec via the regular
  cycle once R5 delivers the Claude revision cycle.

## PO decision (2026-10-03, chat): revise now (superseded by the update above)

- The Advisor consult (`scratch/advisor-consult-findings-round-2026-10-03.md`, verdict
  needs-revision) is incorporated by ONE batched revision of PRD §14 / Spec §21 /
  acceptance (AC-32) / register / traceability before plan approval, then resubmission.
- Finding 10 default applied by the Elephant: patch route for R1 admission registry;
  R5 includes a simplified redesign of the design-course coordinator (authoring
  registration / continuity coupling). PO may overrule at final approval.
- Lifecycle sequence to be fixed after the hotfix-4 trace (Advisor course behaviour on
  changed sources; dispatch clear + re-register likely needs overrides).

## K3-16 (to register after present-plan)

- The repo's Advisor host fixture (`lib/codex-advisor-host.fixture.mjs`) cannot build its temporary
  repository on native Windows (`CRHS-INPUT`), so Advisor re-run/re-export behaviour is untestable
  there; hotfix-4 tests 9/10 failed as FIXTURE only (8/10 green). Fix with the R4 Windows sweep.

## PO decision (2026-10-03, chat): trusted runner-CLI location on win32

- PO approved: on win32, trust `<homedir>\.local\bin` for `.exe` executables, symmetric to POSIX
  `~/.local/bin`, derived from the home directory (no host path in code); all physical/symlink/realpath
  checks kept. Applies via hotfix 6 now and the R4 source fix later.

## K3-17 (to register after present-plan)

- `resolveTrustedSystemExecutable` (lib/trusted-tool-resolution.mjs:54-87) never consults PATH and on
  win32 only searches WINDOWS_SYSTEM_TOOL_ROOTS (Git, System32, scanners, one PO Git exception). POSIX
  includes `~/.local/bin`; win32 has no user-bin equivalent. The Claude CLI lives in the user profile, so
  `runner-design-readiness-bootstrap` fails `claude executable is unavailable` (stderr 75 bytes, length-
  matched) → readiness for Claude/Antigravity on native Windows is impossible. Needs a PO-scoped exception
  (hotfix 6) and an R4 source rule for documented runner-CLI locations on win32.

## K5-10 / K5-11 (to register after present-plan)

- K5-10: design-course-session.mjs:133 builds the non-Codex readiness argv WITHOUT `--runner`;
  runner-design-readiness-bootstrap.mjs requires it → exit 64 (USAGE), stderr 371 bytes swallowed.
  Readiness via the course can never run on Claude or Antigravity. Hotfix 5.
- K5-11: a readiness failure after preparation leaves `claude.preparation.json` behind; the next
  `--run-v2` refuses `DESIGN-COURSE-PREPARATION-EXISTS` (:446) — no resume. PO moved it aside.

## SECURITY candidates from prework W1-5 (2026-10-04, code-read, NOT probed) — register + backlog after approval

- S1 `~/.git-credentials` and `~/.pypirc` are in neither the passive-read credential list
  (passive-read-policy.mjs:115-118) nor the secret basename pattern (:10) → exact-file host reads admitted.
- S2 rg grammar admits `-L` as "files-without-match"; in ripgrep `-L` is `--follow` (symlink traversal).
- S3 (prework W1-3, code-read): git read-only option denylist is exact-spelling while git accepts
  abbreviated long options; `git fetch` admitted wholesale (`--upload-pack`); `-C <dir>` uncontained;
  `git config` unscreened. Extends backlog item `read-only-guard-admits-execution-and-output-options`
  (append evidence in W0-0).
- Both belong to R2 (W1-5); add a register row and a backlog item (security) in W0-0; verify with a
  synthetic-home test, never by reading a real credential store.

## K5-7 refinement (2026-10-04) — no CLI route to a new Advisor course for a revised design

- Unavailable-path revision chain (`design-workflow-package-v2.mjs:45-56`): every revision must keep
  `design-input.md` byte-identical and be a direct child of the previous candidate → a revision that
  touches design-input (our 103f1e1b7) can never be chained.
- Store `open()` (course store :45) returns the existing course whenever `!isNew`; preparation then fails
  `DESIGN-COURSE-INITIAL-CONTEXT-BINDING` (input sha changed).
- A new child course (`openNewCourse`, `newCourseParentId` + `observeInitialCourseDecision`) is only
  reachable from tests — no production caller (rg: only codex-design-advisor-bootstrap signature,
  coordinator-v2, tests).
- Archiving the old course dir is not viable: `current()` resolves via `index-NNNN` files → DACS-CORRUPT.
- Route chosen (pending PO, default): hotfix 8 in the Advisor producer — open a child course from a
  recorded decision (new authoring dispatch id + new input sha), argv/guard shape unchanged.

## K5-12 (to register after present-plan) — Claude readiness can never start

- `runner-design-readiness-bootstrap.mjs` passes the model-output schema (cloned from
  `schemas/pipeline.design-readiness-receipt.v1.json`, `$schema: draft/2020-12`) verbatim to
  `claude --json-schema`; the CLI's validator rejects it: `--json-schema is not a valid JSON Schema: no
  schema with key or ref "https://json-schema.org/draft/2020-12/schema"` → exit 1 after ~0.8 s, before any
  model call. Measured by `scratch/readiness-probe.mjs` (route sonnet/high, prompt 177 KB).
- Second defect: `invokeRunnerReadinessChild` (:253-265) collapses exit code, timeout, stderr, parse
  failure and binding mismatch into one `DESIGN-READINESS-RUNNER-UNAVAILABLE`; the course reports
  `stderrBytes: 0`. Diagnosis needed a probe. Fix: typed sub-reason + bounded stderr head.
- Candidate hotfix 7: strip `$schema`/`$id` from the CLI argument copy only (constraints unchanged;
  `#/$defs` pointer refs resolve under the CLI validator). Antigravity branch: same metadata, validator
  unknown → R4 check.
- VERIFIED 2026-10-03 (probe run 2, `--strip-schema-meta`): exit 0 after 108.7 s, envelope success,
  structured_output valid, report binding == expected (candidate, sources, dispatch). Hotfix-7 scope
  = metadata strip only; the 240 s timeout held (sonnet/high, ~0.43 USD). Raw output:
  `scratch/readiness-probe-stdout.txt`.
- SUBSTANTIVE: the independent readiness verdict is `not-ready`. 4 blocking findings:
  (1) known gaps deferred to a post-approval doc outside the five digest-bound sources (our Rev-1 +
  binding-obligations route); (2) R4 fallback self-dispatch may cover readiness → conflicts Spec §17;
  (3) R1-4 scratch-script admission contradicts S2/B2-iii (payload indirection); (4) "exactly two PO
  approvals" undefined vs signed checkpoint pushes / TOFU / enrollment. Plus 7 non-blocking and
  6 unresolvedChoices. This contradicts the PO's route-2 choice → PO decision needed.
- Hotfix 7 package: `scratch/hotfix-readiness-schema/` (pre `46399377…`, post `a7522bb9…`, target
  `scripts/runner-design-readiness-bootstrap.mjs`); add to W0-3 port list (now hotfixes 1–7).
- Also K1-5 recurred live: `node scratch/readiness-probe.mjs` refused by guard-devplan in
  awaiting-approval although the denial text names scratch/ as admitted.

## K5-9 (to register after present-plan)

- `--run-v2` without `--advisor-result` refuses `DESIGN-COURSE-OUTPUT-COLLISION` whenever the
  preparation/readiness/package paths start with `${outputPrefix}.` (design-course-session.mjs:561-563),
  but the guard (guard-lifecycle-ready.mjs:5193-5199) admits ONLY exactly those prefixed paths →
  the documented "simpler route without --advisor-result" can never run; only the resumed route works.

## K5-8 (to register after present-plan)

- The Claude `--run-v2` route requires an agent-authored
  `evidence/design-course/<feature>/claude.exception-rationale.txt`, but in `awaiting-approval`
  the dev-plan gate refuses the agent's Write to `evidence/` (guard-devplan, "Plan/Spec immutable").
  Only the PO can place it. Fix: admit the course's declared evidence outputs in design phases (R1/R5).

## Hotfix drift (PO question 2026-10-03)

- Installed copy differs from repo source: hooks/guard-dispatch-budget.mjs (hotfix 1+3,
  67bf2663…), lib/design-advisor-course-store.mjs (hotfix 2, 9cede126…), plus hotfix 4 files.
- Add plan WP W0-3: first implementation commits port the hotfix files verbatim (with their
  tests) into plugins/pipeline-core so source == installed; R4 then replaces them properly.
- Add PO queue note: no plugin refresh/reinstall from source until W0-3 landed (would drop
  the hotfixes); re-apply packages if it happens.

## Held until present-plan (HEAD must stay at ec7183dd; Advisor course binds it)

- Register row K3-14 is edited in the working tree (uncommitted) — commit after present-plan.
- K3-15: after a crash between course creation and artifact export, the Advisor
  producer re-run returns `reuse-terminal` / `DAC2-COURSE-ALREADY-EXISTS` without
  re-exporting; `design-course-session --inspect` keeps demanding the Advisor
  stage → deadlock. Course `dac_6330f6603100a7700fd1c8f490f02ea76f2e22d7`,
  outcome `unavailable`, code `native-initial-answer-provenance-unavailable`.
  Fix: idempotent re-export from the stored terminal course (hotfix 4).

- K3-9 item addendum: non-Pipeline subagents (`general-purpose`) are also refused
  on their first Write with `GUARD-BOOTSTRAP-RECEIPT-MISSING`; the remedy (running
  the preflight) is a `node` invocation that briefings commonly forbid and that the
  runner's auto-mode classifier may deny. Observed for the hotfix dispatch
  ALFRED-HOTFIX-BUDGET-WIN32-1 (9 tool uses, nothing written).
- Override plan reported plugin version `0.7.0+codex.20261003105506.1bd1d7bf`
  for the Claude-installed marketplace copy (preflight says `+claude`): runner
  label drift in the HGO plugin identity.
