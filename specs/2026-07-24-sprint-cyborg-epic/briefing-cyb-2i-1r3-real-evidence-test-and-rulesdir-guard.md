# Briefing — CYB-2I-1R3: real-evidence PR-gate test (N2) + rules_dir containment guard (N3)

> Dispatch briefing for one `goldfish-deep` (effort xhigh) task. Fresh context.
> Deliver a diff + condensed evidence-backed report, or a clean stop.

## Field 0 — Dispatch metadata

- **Sub-package:** CYB-2I-1R3 (Sprint Cyborg epic, Wave 6 remediation, third
  round). Fixes findings **N2 (major)** and **N3 (minor)** from the
  follow-up bounded-delta Critic review recorded in `docs/state.md`'s top
  session-summary section (commit `7ce555a`).
  - **N2:** every security-gate test case in
    `check-pr-contributor-gates.test.mjs` uses a synthetic evidence-writer
    helper (`writeSecurityCompletenessEvidence`) — none of them runs the real
    `security-scan.mjs` → `checkSecurityCompleteness` chain. This is exactly
    why F1's residual (a real, reproducible blocking verdict from this
    repo's own `cap.sca` capability) went undetected until a Critic ran the
    real chain by hand.
  - **N3:** `security-scan.mjs`'s `buildAdapterConfig()` resolves
    `security.scanners.semgrep.rules_dir` from the **candidate's own**
    (potentially untrusted, e.g. PR-supplied) manifest via
    `join(rootDir, rulesDirRel)` with no path-containment check — a
    manifest value like `../../etc` would resolve outside `rootDir`.
- **Candidate base:** `feat/sprint-cyborg-claude` @ HEAD (commit `7ce555a` or
  later). Working tree must be clean before you start; keep it clean; end
  with exactly one atomic commit covering both fixes (thematically related:
  "PR-gate evidence-chain hardening").
- **Model / effort:** `goldfish-deep` / xhigh — REAL design latitude on N2
  (exactly how to construct a deterministic, CI-portable real-chain test
  using fake binaries — this repo already has an established pattern for
  this, see Field 2) and a bounded design call on N3 (what containment check
  to use and what happens on violation).
- **Profile:** epic, execution phase.

## Field 1 — Goal

### 1. N2 — add a real-evidence integration test to the PR gate

Add at least one new test case to `check-pr-contributor-gates.test.mjs` that:

1. Builds a fixture `root` (candidate) directory that is a real git repo with
   a real HEAD commit (reuse this file's own `fixture()`/`commit()` helpers
   or a close variant).
2. Runs the REAL `runSecurityScan()` (imported from `./security-scan.mjs`,
   already exported) against that `root`, using the SAME deterministic
   fake-binary technique `security-scan.test.mjs` already established
   (`writeFixtureBinary`-style fake binaries, `fixtureSpawnFn`,
   `assessTrustedExecutablePath: mockAssessFixtureBinary`, `env.PATH`
   pointed at the fake binaries — read `security-scan.test.mjs` in full for
   the exact established pattern, in particular its existing
   `runSecurityScan({ rootDir, env, spawnFn: fixtureSpawnFn,
   assessTrustedExecutablePath: mockAssessFixtureBinary })` call sites).
   This writes REAL `evidence/security-latest.v2.json` +
   `.verdict.json` into `root`, bound to `root`'s own real HEAD commit/tree —
   the exact same artifact production CI produces, not a synthetic envelope.
3. Feeds that real evidence through `validatePrContributorGates({ root,
   claRoot, event })` (real call, no evidence-writer helper) and asserts on
   the actual outcome.
4. At minimum, prove: (a) a fixture where all fake scanners report clean
   findings and every required capability the fixture's own governance
   catalog demands is satisfied → `ok:true` (no
   `SECURITY_COMPLETENESS_BLOCKING`); (b) a fixture where a fake scanner
   binary is deliberately absent from `env.PATH` (simulating a capability
   the fixture requires but the environment can't run) → real blocking
   behavior surfaces through the real chain, i.e.
   `SECURITY_COMPLETENESS_BLOCKING` present with the real reason text
   `checkSecurityCompleteness` actually produces (not a hand-written
   string).
5. This test's goal is specifically to be the kind of test that WOULD have
   caught N1's sibling defect (the `cap.sca`/osv-scanner
   "required-capability-missing" residual documented in `docs/state.md`'s
   F1 entry) if it had existed before — do not design around avoiding that
   scenario; make sure at least one case exercises a required-but-unsatisfied
   capability through the real chain and asserts the gate genuinely blocks.

You are NOT required to fix or route around the actual `cap.sca` catalog gap
itself (that's F1's residual, a separate PO-gated item) — this test's job is
coverage of the *class* of gap, using a fixture-local governance catalog
under your control, not this repo's own real catalog.

### 2. N3 — containment guard on `rules_dir`

In `buildAdapterConfig()` (`harness/scripts/security-scan.mjs`, search
`rulesDirRel`), the resolved `rulesDir` must stay within `rootDir`. Add a
containment check (resolve both paths, e.g. via `resolve()`/`realpath`-safe
comparison, and confirm the resolved `rulesDir` is `rootDir` itself or a
descendant of it) before passing it to the semgrep adapter. On violation,
your call: either fail closed (treat as an adapter-level ERROR with a clear
classification/reason, analogous to how other config-shape violations are
already handled in this file) or ignore the manifest value and fall back to
the adapter's own default (`undefined`, `"auto"` per the F7 CYB-2I-4R
briefing's own prior description of this fallback) — pick whichever is more
consistent with this file's existing error-handling conventions for
similarly-shaped manifest-derived config problems, and justify your choice
in your report. Add test case(s) in `security-scan.test.mjs` proving a
`rules_dir` value that resolves outside `rootDir` (e.g. `"../../etc"`) is
caught, and that ordinary in-tree values are unaffected.

## Field 2 — Context files (read first)

- `harness/scripts/security-scan.test.mjs` — full file, especially the fake-
  binary infrastructure (`writeFixtureBinary`, `BIN_DIR`, `fixtureSpawnFn`,
  `mockAssessFixtureBinary`) and every existing `runSecurityScan(...)` call
  site — this IS your reference pattern for N2, already proven and used
  throughout this exact file.
- `harness/scripts/security-scan.mjs` — full file; `runSecurityScan`
  (exported, already used by tests), `buildAdapterConfig` (N3's target,
  search `rulesDirRel`), `isScannerEnabled`/`resolveBlockOn`/
  `resolveGateMode` for how manifest-derived config already flows.
- `harness/scripts/check-pr-contributor-gates.mjs` and `.test.mjs` — full
  files; the existing `writeSecurityCompletenessEvidence` synthetic-evidence
  helper (your new case(s) do NOT use it — that's the whole point of N2) and
  `fixture()`/`commit()` for the git-repo scaffolding you'll reuse.
- `plugins/pipeline-core/lib/security-completeness-gate.mjs` and
  `security-evidence-evaluator.mjs` — read-only reference for what shape of
  failure text the real chain produces, so your assertions check the real
  reason strings, not invented ones.
- `docs/state.md` — top session-summary section only (N2/N3's exact wording,
  commit `7ce555a`); do not read further into the file.

## Field 3 — Definition of Done (checks)

1. New real-chain integration test(s) added to
   `check-pr-contributor-gates.test.mjs`, covering both a clean-pass and a
   real-blocking scenario via the actual `runSecurityScan()` →
   `validatePrContributorGates()` chain, no synthetic evidence-writer
   involved in these specific new cases.
2. All pre-existing 18 cases in `check-pr-contributor-gates.test.mjs` (17
   original + N1's) still pass unmodified; report before/after count.
3. `rules_dir` containment guard added to `security-scan.mjs`; new test
   case(s) in `security-scan.test.mjs` prove an escaping value is caught and
   an in-tree value is unaffected; report your fail-closed-vs-fallback
   design choice and reasoning.
4. All pre-existing cases in `security-scan.test.mjs` still pass unmodified;
   report before/after count.
5. `node --check` on every file touched.
6. Report explicitly states: which fixture-local governance catalog/config
   you used for the N2 "required-but-unsatisfied capability" case, and
   confirms it does not depend on or modify this repo's own real
   `governance/security-controls/catalog.json`.

## Field 4 — Prohibitions

- MUST NOT modify `governance/security-controls/catalog.json` (this repo's
  own real capability catalog) — F1's residual (the `cap.sca` policy
  question) is explicitly out of scope for this dispatch, PO-gated
  separately.
- MUST NOT weaken, remove, or skip any pre-existing test assertion in either
  test file — only add new ones.
- MUST NOT touch `guard-push.mjs`, `check-close-security-completeness.mjs`,
  or `release-version-plan.mjs`.
- MUST NOT touch `harness/scripts/verify.mjs` or `.claude/guard-config.json`
  — both touched test files are already registered.
- No new runtime dependencies; no real scanner binaries required anywhere in
  either test file (same constraint `security-scan.test.mjs`'s own header
  comment already states).
- Commit trailers: `AI-Assisted: true` and a `Dispatch:` line pointing to
  this briefing; NO `Co-Authored-By` / `Claude-Session` trailers (GIT-03).
  Do not push. One atomic commit.

## Field 5 — Stop conditions

- If constructing a fully real `runSecurityScan()` → gate chain inside
  `check-pr-contributor-gates.test.mjs` would require duplicating a large
  fraction of `security-scan.test.mjs`'s fixture infrastructure with no
  clean way to share it → STOP short of a large duplicative rewrite and
  report the concrete blocker (e.g. propose extracting a shared test-helper
  module instead, but do not do so unilaterally — that is a structural
  change beyond this briefing's scope).

## Field 6 — Evidence to return

Diff (or clean-stop reason) + condensed report covering DoD 1-6.
