# Briefing — CYB-2I-1R: PR contributor-gate remediation (Critic F1 blocker + F2 major)

> Dispatch briefing for one `goldfish-deep` (effort xhigh) task. Fresh context.
> Deliver a diff + condensed evidence-backed report, or a clean stop.

## Field 0 — Dispatch metadata

- **Sub-package:** CYB-2I-1R (Sprint Cyborg epic, Wave 6 remediation). Fixes
  two findings from the bundled Wave 6 Critic review recorded in
  `docs/state.md`'s top session-summary section (commit `51e2161`):
  **F1 (blocker)** — the PR contributor-gate now fails on ~100% of real PRs
  because `.github/workflows/contributor-gates.yml` never generates PR-bound
  security evidence, and `evidence/` is git-ignored so no committed evidence
  could ever satisfy the self-referential commit/tree binding anyway.
  **F2 (major)** — `check-pr-contributor-gates.mjs` is the only one of the
  four AC8 call sites with no gate-activation guard: `guard-push.mjs`, the
  Close script, and the Release function all skip the security check when no
  `security` gate is configured or `mode:"off"`; the PR call site runs it
  unconditionally.
- **Candidate base:** `feat/sprint-cyborg-claude` @ HEAD (commit `51e2161` or
  later). Working tree must be clean before you start; keep it clean; end
  with exactly one atomic commit.
- **Model / effort:** `goldfish-deep` / xhigh — REAL design latitude on the
  exact CI step shape (step name, whether/how to bound its runtime, exact
  placement) within the two Elephant-fixed decisions below.
- **Profile:** epic, execution phase.
- **Why this exists:** AC8 (`cyb-2-feature-spec.md`) requires Push/PR/Close/
  Release to consume the same completeness evaluator *consistently*; the PR
  leg currently makes this repo's own PRs unmergeable under its own
  self-applied `gates.security.mode: blocking` (`.claude/pipeline.yaml`), and
  would hard-fail every PR for any consumer project too, defeating the
  opt-in design every other call site honors.

## Field 1 — Goal

1. **Fix F2 first (mechanical, low-risk): add the gate-activation guard.**
   In `harness/scripts/check-pr-contributor-gates.mjs`, wrap the new
   `checkSecurityCompleteness(...)` call (currently unconditional, around
   line 141-147) in the same opt-in-skip pattern `guard-push.mjs` uses
   (`plugins/pipeline-core/hooks/guard-push.mjs`, search
   `const securityGate = gateConfig(manifest, "security"); if (securityGate
   && securityGate.mode !== "off") { ... }`) and
   `check-close-security-completeness.mjs` mirrors exactly
   (`plugins/pipeline-core/scripts/check-close-security-completeness.mjs`,
   uses `loadManifest`/`gateConfig` from `../lib/manifest.mjs`). Load the
   manifest via `loadManifest(root)` (root = the `--root` CLI argument this
   script already resolves), resolve `gateConfig(manifest, "security")`, and
   only run the completeness check (and only push
   `SECURITY_COMPLETENESS_BLOCKING` errors) when that gate exists and its
   `mode !== "off"`. A project with no security gate configured must get
   `errors` unaffected by this check, exactly like the other three call
   sites already behave.
2. **Fix F1: wire PR-bound evidence generation into
   `.github/workflows/contributor-gates.yml`.** Elephant-fixed mechanism
   (confirmed working via manual inspection this session, do not redesign):
   `harness/scripts/security-scan.mjs --root <dir>` writes
   `<dir>/evidence/security-latest.v2.json` +
   `<dir>/evidence/security-latest.v2.verdict.json`, bound to that
   directory's own git commit/tree — exactly the shape
   `checkSecurityCompleteness` needs. Add a new step to the `cla-and-dco` job
   in `contributor-gates.yml`, placed AFTER "Import the base commit into the
   candidate object store" and BEFORE "Verify current CLA acceptance and
   every PR commit DCO sign-off", that runs:
   `node trusted-gate/harness/scripts/security-scan.mjs --root candidate`
   (mirrors the existing steps' pattern of running the *trusted* checkout's
   script against the *candidate* directory). This scans the untrusted PR
   content with static scanners only (gitleaks/semgrep/osv-scanner/license-
   check) — no PR code is ever executed, consistent with the job's existing
   "untrusted candidate without credentials" checkout already in place. You
   own: whether this step needs its own `timeout-minutes` (the job's overall
   timeout is currently 5 minutes total — check whether `security-scan.mjs`'s
   own `DEFAULT_TIMEOUT_MS` fits inside that budget or whether the job
   timeout needs raising; state your reasoning either way), and the exact
   step name/comment style (match the file's existing step-naming
   convention).
3. **Confirm the fix closes the loop.** After both changes, a fresh
   `candidate` checkout with no committed evidence must go through: (a) the
   new CI step generates `candidate/evidence/security-latest.v2*.json` bound
   to the candidate's own HEAD commit/tree, (b)
   `check-pr-contributor-gates.mjs --root candidate` finds and validates that
   evidence via the existing binding check in
   `security-completeness-gate.mjs`, (c) a clean candidate tree (no secrets/
   license/SAST findings) produces `ok:true`. You cannot run the actual
   GitHub Actions workflow from this sandbox — instead, write a **local
   reproduction**: a temp git repo (or reuse this repo's own working tree
   read-only) where you run `security-scan.mjs --root <dir>` then
   `check-pr-contributor-gates.mjs --root <dir> ...` back to back and show
   the second command no longer reports `SECURITY_COMPLETENESS_BLOCKING`
   missing-evidence errors. Document the exact commands in your report.

## Field 2 — Context files (read first)

- `harness/scripts/check-pr-contributor-gates.mjs` — full file; the
  unconditional call site is around lines 141-147 (may have shifted slightly
  since this briefing was written — locate by searching
  `checkSecurityCompleteness`).
- `harness/scripts/check-pr-contributor-gates.test.mjs` — full file; your new
  test cases for the activation guard (gate absent → skip; `mode:"off"` →
  skip; gate active → unchanged behavior, same as today) must sit alongside
  the existing 15 cases without weakening any of them (matches the pattern
  CYB-2I-2's `check-close-security-completeness.test.mjs` already
  established for the same guard).
- `plugins/pipeline-core/hooks/guard-push.mjs` — read the gate-activation
  block (search `gateConfig(manifest, "security")`) as your exact reference
  pattern.
- `plugins/pipeline-core/scripts/check-close-security-completeness.mjs` —
  read in full; it already mirrors the exact guard you're adding here (its
  own header states "Mirrors guard-push.mjs's own gate-activation pattern
  EXACTLY") — closest existing precedent, same repo.
- `plugins/pipeline-core/lib/manifest.mjs` — `loadManifest`/`gateConfig`
  signatures.
- `.github/workflows/contributor-gates.yml` — full file (short); your new
  step goes in the single existing `cla-and-dco` job.
- `harness/scripts/security-scan.mjs` — read `parseArgs`/`main` (search
  `--root`) and the evidence-writing block (search `evidenceDir`) to confirm
  the `--root <dir>` contract this briefing relies on.
- `plugins/pipeline-core/lib/security-completeness-gate.mjs` — the shared
  evaluator both the CI step's evidence and this check site's call must
  agree with; read its binding-check block (commit/tree equality) to
  understand exactly what "PR-bound evidence" must satisfy.
- `docs/state.md` — top session summary section only (the Critic-findings
  retraction, commit `51e2161`) for F1/F2's exact wording; do not read
  further into the file (state/handover narrative is not admissible input
  for a Goldfish briefing beyond what's excerpted here).

## Field 3 — Definition of Done (checks)

1. `check-pr-contributor-gates.mjs` gains the `gateConfig` activation guard;
   `node --check` clean.
2. New test cases prove: gate absent → completeness check skipped, existing
   CLA/DCO behavior unaffected; `mode:"off"` → same; gate active + evidence
   absent → still fails closed (today's behavior, unchanged when a gate IS
   configured); gate active + evidence present/bound/clean → `ok:true`. All
   pre-existing 15 cases still pass unmodified.
3. `contributor-gates.yml` gains the new `security-scan.mjs --root candidate`
   step, correctly placed, with your stated reasoning on timeout sizing.
4. Local reproduction (Field 1 step 3) documented with exact commands and
   output showing the two-step flow (`security-scan.mjs` then
   `check-pr-contributor-gates.mjs`) resolves cleanly for a clean candidate
   tree with no missing-evidence errors.
5. `node --check` on every `.mjs` file touched or added.
6. Report explicitly re-confirms this fixes F1 for the general case
   (consumer projects with no security gate configured: PR check is a
   no-op, same as before this whole sub-package existed) AND for this repo's
   own self-application case (`mode:"blocking"`: PR check now has evidence
   to evaluate instead of failing closed on missing evidence).

## Field 4 — Prohibitions

- MUST NOT touch `plugins/pipeline-core/lib/security-completeness-gate.mjs`
  or its test file (the shared evaluator — read-only, out of scope).
- MUST NOT touch `guard-push.mjs`, the Close script, or
  `release-version-plan.mjs` — those three call sites are not part of this
  finding.
- MUST NOT relax, remove, or weaken any of the 15 pre-existing test cases in
  `check-pr-contributor-gates.test.mjs` — only add new ones.
- MUST NOT attempt to register anything in `harness/scripts/verify.mjs` or
  edit `.claude/guard-config.json` — unrelated to this finding, and the
  established TP-3/classifier block applies if you somehow think you need to
  (you don't; nothing here requires a new `verify.mjs` TEST_SUITES entry,
  `check-pr-contributor-gates.test.mjs` is already registered).
- No new runtime dependencies.
- Commit trailers: `AI-Assisted: true` and a `Dispatch:` line pointing to
  this briefing; NO `Co-Authored-By` / `Claude-Session` trailers (GIT-03).
  Do not push. One atomic commit.

## Field 5 — Stop conditions

- If `security-scan.mjs --root candidate` cannot run standalone against an
  arbitrary directory the way this briefing assumes (e.g. it hard-requires
  being run from the repo root, or has an undisclosed dependency on files
  outside `candidate`) → STOP and report the exact blocker; do not silently
  redesign the CI wiring around a different assumption without flagging it.
- If you find the job's 5-minute total timeout is clearly insufficient for
  `security-scan.mjs` to complete (not just "might be tight") → STOP short
  of guessing a number; report your evidence (e.g. a timed local run) and
  recommend a specific value for the Elephant/PO to confirm, rather than
  picking one un-evidenced.

## Field 6 — Evidence to return

Diff (or clean-stop reason) + condensed report covering DoD 1-6.
