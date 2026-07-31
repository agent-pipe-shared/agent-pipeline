# Briefing — CYB-2I-1R2: fix untrusted-manifest gate bypass (Critic N1, major)

> Dispatch briefing for one `goldfish-deep` (effort xhigh) task. Fresh context.
> Deliver a diff + condensed evidence-backed report, or a clean stop.

## Field 0 — Dispatch metadata

- **Sub-package:** CYB-2I-1R2 (Sprint Cyborg epic, Wave 6 remediation, second
  round). Fixes finding **N1 (major)** from the follow-up bounded-delta
  Critic review recorded in `docs/state.md`'s top session-summary section
  (commit `31c13b9`): the F2 gate-activation guard added in `251e15a` reads
  `loadManifest(root)`, where `root` is the **untrusted PR candidate
  checkout** — a PR author can set `gates.security.mode: off` (or delete
  `.claude/pipeline.yaml`) in their own branch to silently disable the
  security-completeness check meant to constrain them. Every other AC8 call
  site (Push, Close) reads a manifest the actor being checked does not
  control; this call site currently does not.
- **Candidate base:** `feat/sprint-cyborg-claude` @ HEAD (commit `31c13b9` or
  later). Working tree must be clean before you start; keep it clean; end
  with exactly one atomic commit.
- **Model / effort:** `goldfish-deep` / xhigh — security-gate-activation
  logic, class-high risk per this repo's own model policy, even though the
  mechanical fix itself is narrow.
- **Profile:** epic, execution phase.
- **Why this exists:** AC8 requires the PR call site to consume the shared
  completeness evaluator the same way Push/Close/Release do — none of which
  let the actor being gated control whether the gate runs. This is a real,
  reproduced gate bypass (the Critic demonstrated it on a scratch clone),
  not a theoretical concern.

## Field 1 — Goal

1. In `harness/scripts/check-pr-contributor-gates.mjs`, change the
   gate-activation guard (search `Gate-activation guard (F2, CYB-2I-1R)`,
   currently around lines 142-159) to read the manifest from **`claRoot`**
   (the already-present, already-trusted parameter — the workflow passes
   `--cla-root trusted-gate`, and `readClaContract(claRoot)` already uses it
   for the CLA-contract read a few lines above) instead of from `root`. The
   activation *decision* (whether the gate is on/off) must come from a root
   the PR author cannot write to; the *evidence being evaluated* correctly
   stays bound to `root`/`headSha` (the candidate's own commit/tree) — do
   not change what `checkSecurityCompleteness` is called with, only which
   root supplies `loadManifest`/`gateConfig`.
2. `validatePrContributorGates({ root, claRoot, event })` already receives
   `claRoot` as a parameter — no signature change needed. If `claRoot` is
   somehow absent/invalid (the existing `CLA_ROOT_INVALID` error path already
   covers this for the CLA read), the security-gate activation check must
   fail closed the same way the CLA read already does — do not treat a
   missing `claRoot` as "gate absent, skip"; state and justify whatever
   choice you make here explicitly in your report (this is the one place
   with genuine design latitude: what happens to gate activation when
   `claRoot` itself can't be read).
3. Update `harness/scripts/check-pr-contributor-gates.test.mjs`'s `fixture()`
   helper (search `function fixture`) to write the
   `.claude/pipeline.yaml` manifest into `claRoot`, not `root` — every
   existing security-gate test case currently relies on the manifest being
   readable from `root`; after your fix that must move to `claRoot` for
   those tests to keep exercising the same on/off/absent scenarios they did
   before, this time through the correct (trusted) root. Do not weaken any
   existing assertion — only relocate where the fixture writes the manifest
   file and adjust plumbing as needed.
4. Add a NEW test case proving the exact bypass this finding describes is
   now closed: a fixture where `root` (the untrusted candidate) has its own
   `.claude/pipeline.yaml` set to `mode: off` (or deleted) while `claRoot`
   (trusted) has `mode: blocking` and missing/blocking evidence — assert the
   completeness check still runs and still fails closed (i.e. the PR author
   cannot disable the gate from inside their own branch). This is the single
   most important new assertion in this dispatch.

## Field 2 — Context files (read first)

- `harness/scripts/check-pr-contributor-gates.mjs` — full file, especially
  the F2 guard block and `validatePrContributorGates`'s existing
  `claRoot`/`readClaContract` usage as your reference for "this parameter is
  already the trusted root, already used for one purpose."
- `harness/scripts/check-pr-contributor-gates.test.mjs` — full file; the
  `fixture()` helper (search `function fixture`) and every test case that
  currently sets `security` via that helper's `security` parameter.
- `plugins/pipeline-core/lib/manifest.mjs` — `loadManifest`/`gateConfig`
  signatures (unchanged by this fix, just called with a different root).
- `.github/workflows/contributor-gates.yml` — confirm `--cla-root
  trusted-gate` is indeed the trusted checkout (already true, read-only
  confirmation, no changes expected here).
- `docs/state.md` — top session-summary section only (N1's exact wording,
  commit `31c13b9`); do not read further into the file.

## Field 3 — Definition of Done (checks)

1. Gate-activation guard reads `claRoot` instead of `root`; `node --check`
   clean.
2. `fixture()` writes the manifest into `claRoot`; all pre-existing security-
   gate test cases (gate absent/mode-off/gate-active-blocking/gate-active-
   clean) still pass, now correctly exercising the trusted root.
3. New test proves the exact bypass is closed: untrusted `root` manifest
   trying to disable/weaken the gate has no effect; the trusted `claRoot`
   manifest's configuration is what actually governs activation.
4. All pre-existing 17 cases (15 original + F2's 2) still pass; report the
   exact before/after count for the full file.
5. `node --check` on every file touched.
6. Report states your design decision for Field 1 item 2 (missing/invalid
   `claRoot` behavior) with reasoning.

## Field 4 — Prohibitions

- MUST NOT change what `checkSecurityCompleteness` evaluates (still
  `root`/`headSha`'s own commit/tree evidence) — only which root supplies the
  activation *decision*.
- MUST NOT touch `guard-push.mjs`, `check-close-security-completeness.mjs`,
  or `release-version-plan.mjs` — not part of this finding.
- MUST NOT relax, remove, or weaken any pre-existing test assertion — only
  relocate fixture setup and add new cases.
- MUST NOT touch `harness/scripts/verify.mjs` or `.claude/guard-config.json`.
- No new runtime dependencies.
- Commit trailers: `AI-Assisted: true` and a `Dispatch:` line pointing to
  this briefing; NO `Co-Authored-By` / `Claude-Session` trailers (GIT-03).
  Do not push. One atomic commit.

## Field 5 — Stop conditions

- If `claRoot` turns out to be reachable/writable by the PR author through
  some path this briefing didn't anticipate (e.g. the workflow's fetch step
  somehow merges candidate content into `trusted-gate`) → STOP and report the
  exact mechanism rather than proceeding on a fix that doesn't actually close
  the bypass. (Expected: it is not reachable — `trusted-gate` is checked out
  from the base ref before the candidate fetch, per the workflow — but verify
  this yourself rather than assuming the briefing's premise.)

## Field 6 — Evidence to return

Diff (or clean-stop reason) + condensed report covering DoD 1-6.
