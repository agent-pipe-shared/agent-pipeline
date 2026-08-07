# Briefing — CYB-2I-5: CI network-isolation for the offline conformance suite (Wave 6, AC14)

> Dispatch briefing for one `goldfish-deep` (effort xhigh) task. Fresh context.
> Deliver a diff + condensed evidence-backed report, or a clean stop.

## Field 0 — Dispatch metadata

- **Sub-package:** CYB-2I-5 (Sprint Cyborg epic, Wave 6, `cyb-2i-1h-body-slicing.md`
  §1 row 5 / `cyb-2-body-slicing.md` §3 item 4: "Needs a quick survey of existing
  `.github/workflows/*.yml` for a reusable network-isolation pattern before
  scoping precisely (not yet investigated this session)" — that survey has now
  been done (below) and this briefing is the result.
- **Candidate base:** `feat/sprint-cyborg-claude` @ HEAD. Working tree must be
  clean before you start; keep it clean; end with exactly one atomic commit.
- **Model / effort:** `goldfish-deep` / xhigh — REAL design latitude: which
  exact test file(s) constitute "the full offline conformance suite" is not
  fully pinned down yet (see Field 1 step 1), and the concrete network-lockdown
  IMPLEMENTATION (exact primitives to intercept, exact assertion shape) is your
  own design call within the Elephant-fixed MECHANISM choice below.
- **Profile:** epic, execution phase.
- **Why this exists:** AC14 (`cyb-2-feature-spec.md`, row 49): "Full
  conformance suite runs offline with fake adapters only; CI job asserts no
  outbound network call during that suite."

## Field 1 — Goal

1. **Identify the suite first (do not assume).** `cyb-2-body-slicing.md` names
   CYB-2A (`plugins/pipeline-core/lib/security-evidence-fixture-matrix.mjs` +
   its `.test.mjs`) as "the fixture matrix (foundation)" for the 14/15
   failure-class fixtures, but reading that module's own header comment shows
   it is a FOUNDATION-ONLY stub (`evaluateFixturePlaceholder`, not the real
   evaluator) — CYB-2B (`security-evidence-evaluator.mjs` +
   `security-evidence-evaluator.test.mjs`) is the module that actually
   consumes these fixtures through the real, pure evaluator. Read both test
   files and determine which one (or which combination) is "the full offline
   conformance suite" AC14 means. **Disclose in your report, do not silently
   pick:** a fresh grep by the Elephant found NEITHER
   `security-evidence-fixture-matrix.test.mjs` NOR
   `security-evidence-evaluator.test.mjs` currently registered anywhere in
   `harness/scripts/verify.mjs`'s `TEST_SUITES` array, nor in
   `plugins/pipeline-core/lib/scoped-verify-registration.mjs` (the Sentinel
   epic's separate, unrelated registration mechanism — do not touch that
   file, see CYB-1h's briefing for the full disposition of why it does not
   apply to Cyborg). If true, this is a pre-existing gap that belongs to
   CYB-2A/CYB-2B/CYB-2E (already-closed sub-packages), not something to fix
   as a side effect of THIS task — but AC14 cannot be satisfied by a CI job
   that asserts network-silence over a suite CI never actually runs. **Stop
   condition, not silent scope creep:** if you confirm this registration gap
   is real, STOP and report it rather than either (a) silently registering
   those pre-existing suites yourself (out of scope, a separate finding) or
   (b) building network-isolation around a suite that CI doesn't execute
   (satisfies nothing).
2. **Mechanism (fixed by the Elephant, do not redesign):** an **assertion-wrapper
   around the test run**, not OS-level network-namespace sandboxing. Reasoning:
   GitHub-hosted `ubuntu-latest` runners (confirmed the only runner this repo's
   `.github/workflows/*.yml` use) do not have a reusable, already-present
   network-namespace-isolation step in this repo (confirmed: neither
   `verify.yml` nor `contributor-gates.yml` has one), and standing one up
   (`unshare --net`, iptables rules, or a third-party GH Action) is
   disproportionate infrastructure for a Node-only test suite where every
   candidate network access point is a Node built-in module call
   (`node:http`/`node:https`/`node:net`/global `fetch`) — a Node-level
   `--import`/`--require` preload that monkey-patches those primitives to
   throw on any outbound connection attempt (loopback/localhost exempted only
   if a concrete existing test genuinely needs it — check first, do not
   pre-emptively carve out an exemption nobody needs) is fully sufficient to
   prove AC14's claim and is trivially portable to any future CI runner.
   Design and implement this preload module yourself (e.g.
   `plugins/pipeline-core/scripts/network-lockdown.mjs`, your own naming) —
   it must FAIL LOUDLY (throw, not silently no-op) the instant any of the
   patched primitives is invoked, so a genuine accidental network call in the
   conformance suite is a hard test failure, not a silently-swallowed no-op.
3. Wire the identified suite(s) from step 1 to run under this lockdown as a
   distinct CI step (either a new step in the existing `.github/workflows/
   verify.yml`, or a new dedicated workflow file — your call, state why) that
   FAILS if the lockdown module ever threw during that run. Locally-runnable
   too (document the exact command in your report) — this must not be a
   CI-only, unreproducible check.

## Field 2 — Context files (read first)

- `plugins/pipeline-core/lib/security-evidence-fixture-matrix.mjs` +
  `.test.mjs` — full files; note the header's own "FOUNDATION ONLY... does
  NOT build the real evaluator" disclaimer.
- `plugins/pipeline-core/lib/security-evidence-evaluator.mjs` +
  `.test.mjs` — full files; confirmed zero network-call code in the evaluator
  itself (pure function) — if this is genuinely "the" conformance suite, the
  lockdown is a belt-and-braces proof of purity, not a fix for a suspected
  leak.
- `harness/scripts/security-readiness/` and
  `plugins/pipeline-core/scripts/security-readiness/` (`gitleaks-readiness.mjs`,
  `osv-scanner-readiness.mjs`, `semgrep-readiness.mjs`, `tool-identity.mjs`,
  `prepared-scanner-run.mjs`) — these are the REAL scanner-readiness probes
  (as opposed to the fixture/evaluator layer); read enough to confirm whether
  any of them is itself part of "the conformance suite" or a separate concern
  (tool presence detection, not evidence evaluation) — likely the latter, but
  confirm rather than assume.
- `.github/workflows/verify.yml`, `.github/workflows/contributor-gates.yml` —
  READ ONLY, both full files (small) — confirmed no existing network-isolation
  pattern in either.
- `harness/scripts/verify.mjs` — the `TEST_SUITES` array, to confirm the
  registration-gap finding from Field 1 step 1 yourself before reporting it.
- `specs/2026-07-24-sprint-cyborg-epic/cyb-2-feature-spec.md` AC14;
  `cyb-2-body-slicing.md` §3 item 4; `cyb-2i-1h-body-slicing.md` §1 row
  CYB-2I-5.

## Field 3 — Definition of Done (checks)

1. Report explicitly names which test file(s) constitute "the full offline
   conformance suite" for AC14's purposes, with your reasoning, OR is a clean
   stop per Field 1 step 1's stop condition if the registration gap blocks a
   meaningful implementation.
2. New network-lockdown preload module authored, with its own small
   regression test proving: (a) an attempted outbound call under lockdown
   throws; (b) the conformance suite itself runs clean under lockdown (proves
   today's real code makes no outbound call); (c) removing the lockdown
   changes nothing about the suite's own pass/fail result (the lockdown is
   purely an observability/assertion layer, never a behavior change to the
   code under test).
3. A documented, locally-runnable command that runs the conformance suite
   under lockdown, plus a CI step wired to run it and fail the job if the
   lockdown module ever threw.
4. `node --check` on every file you touch or add.
5. Report includes: the suite-identification finding (step 1), confirmation
   of the pre-existing verify.mjs registration gap if found (do not fix it,
   just report it precisely), the lockdown mechanism's exact primitives
   patched, and the exact local + CI invocation commands.

## Field 4 — Prohibitions

- MUST NOT register `security-evidence-fixture-matrix.test.mjs` or
  `security-evidence-evaluator.test.mjs` in `harness/scripts/verify.mjs` as a
  side effect of this task if you find them unregistered — that is a
  pre-existing gap belonging to a different, already-closed sub-package; report
  it, do not fix it here (scope discipline).
- MUST NOT touch `plugins/pipeline-core/lib/scoped-verify-registration.mjs`.
- MUST NOT implement OS-level network-namespace/iptables sandboxing (Field 1
  step 2's fixed mechanism decision).
- **If your work requires editing `harness/scripts/verify.mjs` or
  `.claude/guard-config.json`: DO NOT.** Both are TP-3-protected, and in this
  unattended/AFK session the Claude Code auto-mode classifier hard-blocks any
  edit to `.claude/guard-config.json` (the established lift-and-restore
  mechanism) regardless of who/what attempts it — confirmed by repeated
  blocked attempts this session. If your design needs one of these files
  touched, do everything else and stop short of that specific edit, noting it
  as deferred pending an interactive session.
- No new runtime dependencies.
- Commit trailers: `AI-Assisted: true` and a `Dispatch:` line; NO
  `Co-Authored-By` / `Claude-Session` trailers (GIT-03). Do not push. One
  atomic commit (covering everything except any TP-3-blocked edit).

## Field 5 — Stop conditions

- The Field 1 step 1 registration gap is real and you judge it makes a
  meaningful CI network-isolation job unsatisfiable right now (nothing for it
  to gate) → STOP and report precisely rather than building lockdown
  infrastructure around a suite CI never runs.
- You find a genuine, already-present outbound network call inside the
  conformance suite's code path (i.e. AC14's premise — "runs offline with
  fake adapters only" — is currently FALSE) → STOP and report this as a
  correctness finding for the Elephant; do not silently patch the offending
  code path as part of this task (out of scope, needs its own visibility).

## Field 6 — Evidence to return

Diff (or clean-stop reason) + condensed report covering DoD 1-5.
