<!-- po-language: en -->

# Verify registration patch — prepared, not applied

- Task: `PHX-REGCHECK` (goldfish). Deliverable per
  `specs/sprint-phoenix-epic/phase-plan_gate-integrity.md` §R1.1/§R1.3/AC-P10.
- Measured/generated at commit `154a113` (working tree, 2026-08-08), against
  `harness/scripts/verify.mjs` as it exists today, using
  `harness/scripts/check-verify-suite-registration.mjs` (this dispatch's own
  checker) run against the real repository.
- **Not applied.** `harness/scripts/verify.mjs` is TP-3-protected; this dispatch
  is explicitly forbidden from editing it or from requesting a maintenance
  window. The lines below are exact and ready for a single human-signed TP-3
  window (approval budget table, phase plan: "1 signature covers every
  registration in R1, in one time-boxed window").

## Current-state arithmetic

Scope note: "registered count" below means entries in the three registration
arrays (`TEST_SUITES`, `SCOPED_VERIFY_SUITES`, `WINDOWS_ASSURANCE_VERIFY_SUITES`)
whose `file:` resolves to a `*.test.mjs` path — the same scope
`unregistered-suite-classification.md`'s headline uses. It does not include the
two manifest-gated `PHASE_STEPS` (`validate-manifest.mjs`, `security-scan.mjs`),
which are plain scripts, not `*.test.mjs` suites, and are computed at verify
runtime rather than declared in these arrays.

| | count |
| --- | --- |
| Currently registered (measured today, this run) | **259** |
| New entries this patch adds | **+104** (102 green suites + 1 for the new checker's own suite + 1 for the checker's own live `-check` step, R1.3) |
| Expected total after application | **363** |

The classification report measured 242 registered entries at commit `0ffe37c`
(2026-08-08, earlier the same day); the 259 measured here reflects registrations
landed by other dispatches in the same TP-3 window since that measurement. This
patch's 104 new lines are additive to whatever the registered count is at
application time — the three self-checks below (re-run immediately before
application) are what actually gate correctness, not the absolute 259 figure.

## Self-checks (required by this task's DoD)

All three run via `check-verify-suite-registration.mjs`'s `checkVerifySuiteRegistration()`
export against the real repository, cross-referenced against the 104 entries below.

| Check | Result |
| --- | --- |
| Entry count emitted equals 102 (green, from the classification report) + 1 (this checker's own suite) + 1 (this checker's own live `-check` step) = 104 | **PASS** — 104 entries below |
| None of the 104 is one of the classification report's 7 red suites | **PASS** — zero overlap |
| None of the 104 is already registered in `verify.mjs` today | **PASS** — zero overlap with the 259 currently-registered entries |
| `check-verify-suite-registration.mjs` (Batch 13's entry) is not a `*.test.mjs` file and was therefore never part of the unregistered-suite measurement (the 102 green files, or the 103rd for the checker's own test file) — it is an added gate STEP, not a discovered suite. Registering it makes verify actually invoke the checker on every run, which is the entire point of R1.3; the entry count above folds it in as a fourth, distinct term precisely so this is not conflated with a suite the classification report found | **N/A — recorded for legibility to whoever applies the patch** |

Cross-enumeration check (stop condition #2 in this dispatch's briefing): running
the checker's file-system walk against the real repository and subtracting this
checker's own new test file (`harness/scripts/check-verify-suite-registration.test.mjs`,
itself newly unregistered and not part of the classification report) from the
live "unregistered" set produces **exactly** the classification report's 102
green files — no file present in one set and absent from the other, in either
direction. The classification report's enumeration and this run's live
enumeration agree.

## Registration form and naming method

Every entry below is added to `TEST_SUITES` (the general-purpose array; the two
`Object.freeze(...)`-wrapped arrays are reserved for their own authority-bound
suite sets — `SCOPED_VERIFY_SUITES`/`WINDOWS_ASSURANCE_VERIFY_SUITES` — and are
not touched by this patch), in the file's existing entry form:
`{ name: "...", file: join(IDENT, "...") },` with `IDENT` one of
`libDir` / `hooksDir` / `scriptDir` / `pluginScriptsDir` / `repoRoot`, matching
each file's location exactly as `harness/scripts/verify.mjs` itself resolves
paths (~60-67, ~482-483).

**Naming rule.** Default: the file's basename with `.test.mjs` stripped, plus
`-tests` (e.g. `network-lockdown.test.mjs` -> `network-lockdown-tests`).

**Disambiguation, applied only where the default rule would collide:**
- Where a `lib/` file and a `scripts/` file share the same basename (both
  measured green), the existing repository convention is reused verbatim — see
  `local-worker-supervisor-core-tests` (lib) /
  `local-worker-supervisor-cli-tests` (scripts), already registered today.
  Applied to: `audit-bundle`, `change-control`, `organization-policy`,
  `governance-event`, `governance-replay` (six entries: `*-core-tests` /
  `*-cli-tests`).
- `harness/scripts/security-readiness/security-readiness.test.mjs` is named
  `security-readiness-harness-tests`, not `security-readiness-tests` — the
  classification report's own §"The Elephant's 108 vs. the true 109" documents
  that a plain basename match here false-positives against the *already
  registered* `plugins/pipeline-core/lib/security-readiness.test.mjs`
  (`security-readiness-tests`). No literal string collision would occur either
  way, but the explicit rename removes the ambiguity that produced that exact
  false positive.
- No other collision was found: verified against the live set of 259 currently
  registered names and against the 104 new names themselves (all 104 are
  pairwise distinct and none matches an existing name).

## Batches (each independently revertible per AC-P10)

Every batch below is a self-contained, contiguous group of `TEST_SUITES` lines
with no dependency on any other batch — each can be inserted or reverted alone,
leaving the gate green on the remainder, because every suite it registers is
independently measured-green (or, for the last batch, independently proven by
this dispatch's own suite). Runtimes are the classification report's
measured per-file durations (`node --test <file>`, sequential); the new
checker's own suite has no prior measurement and is reported separately.

### Batch 1 — `afk-*` (6 suites, 1406 ms)

```js
  { name: "afk-assumption-mode-tests", file: join(libDir, "afk-assumption-mode.test.mjs") },
  { name: "afk-capability-worker-tests", file: join(libDir, "afk-capability-worker.test.mjs") },
  { name: "afk-git-adapter-tests", file: join(libDir, "afk-git-adapter.test.mjs") },
  { name: "afk-review-tests", file: join(libDir, "afk-review.test.mjs") },
  { name: "afk-transaction-host-tests", file: join(libDir, "afk-transaction-host.test.mjs") },
  { name: "afk-claude-host-tests", file: join(pluginScriptsDir, "afk-claude-host.test.mjs") },
```

### Batch 2 — `codex-*` other (2 suites, 2678 ms)

```js
  { name: "codex-sandbox-preflight-host-control-tests", file: join(scriptDir, "codex-sandbox-preflight-host-control.test.mjs") },
  { name: "codex-isolation-control-decomposition-tests", file: join(pluginScriptsDir, "codex-isolation-control-decomposition.test.mjs") },
```

### Batch 3 — `codex-*critic*` isolation (6 suites, 998 ms)

```js
  { name: "codex-critic-packet-host-tests", file: join(pluginScriptsDir, "codex-critic-packet-host.test.mjs") },
  { name: "codex-critic-probe-split-tests", file: join(pluginScriptsDir, "codex-critic-probe-split.test.mjs") },
  { name: "codex-critic-shadow-tests", file: join(pluginScriptsDir, "codex-critic-shadow.test.mjs") },
  { name: "codex-isolated-critic-claims-tests", file: join(pluginScriptsDir, "codex-isolated-critic-claims.test.mjs") },
  { name: "run-codex-critic-isolation-tests", file: join(pluginScriptsDir, "run-codex-critic-isolation.test.mjs") },
  { name: "run-codex-critic-probe-split-tests", file: join(pluginScriptsDir, "run-codex-critic-probe-split.test.mjs") },
```

### Batch 4 — `evidence-view` (3 suites, 222 ms)

```js
  { name: "evidence-view-model-tests", file: join(libDir, "evidence-view-model.test.mjs") },
  { name: "evidence-view-renderer-tests", file: join(libDir, "evidence-view-renderer.test.mjs") },
  { name: "evidence-viewer-tests", file: join(pluginScriptsDir, "evidence-viewer.test.mjs") },
```

### Batch 5 — `governance-*` (18 suites, 2350 ms)

```js
  { name: "governance-authority-resolver-tests", file: join(libDir, "governance-authority-resolver.test.mjs") },
  { name: "governance-event-projection-tests", file: join(libDir, "governance-event-projection.test.mjs") },
  { name: "governance-event-store-tests", file: join(libDir, "governance-event-store.test.mjs") },
  { name: "governance-event-core-tests", file: join(libDir, "governance-event.test.mjs") },
  { name: "governance-export-adapter-tests", file: join(libDir, "governance-export-adapter.test.mjs") },
  { name: "governance-export-delivery-tests", file: join(libDir, "governance-export-delivery.test.mjs") },
  { name: "governance-export-outbox-store-tests", file: join(libDir, "governance-export-outbox-store.test.mjs") },
  { name: "governance-export-outbox-tests", file: join(libDir, "governance-export-outbox.test.mjs") },
  { name: "governance-replay-view-tests", file: join(libDir, "governance-replay-view.test.mjs") },
  { name: "governance-replay-core-tests", file: join(libDir, "governance-replay.test.mjs") },
  { name: "human-governance-ledger-tests", file: join(libDir, "human-governance-ledger.test.mjs") },
  { name: "lifecycle-governance-events-tests", file: join(libDir, "lifecycle-governance-events.test.mjs") },
  { name: "governance-authority-tests", file: join(pluginScriptsDir, "governance-authority.test.mjs") },
  { name: "governance-event-cli-tests", file: join(pluginScriptsDir, "governance-event.test.mjs") },
  { name: "governance-export-tests", file: join(pluginScriptsDir, "governance-export.test.mjs") },
  { name: "governance-replay-viewer-tests", file: join(pluginScriptsDir, "governance-replay-viewer.test.mjs") },
  { name: "governance-replay-cli-tests", file: join(pluginScriptsDir, "governance-replay.test.mjs") },
  { name: "phoenix-governance-threat-model-tests", file: join(pluginScriptsDir, "phoenix-governance-threat-model.test.mjs") },
```

### Batch 6 — guards / human authorization (3 suites, 588 ms)

`guard-git-phoenix.test.mjs` (the 4th member of this cluster in the
classification report) is one of the red 7 and is deliberately excluded here —
filed under R1.2, not registered.

```js
  { name: "critical-human-proof-gate-tests", file: join(pluginScriptsDir, "critical-human-proof-gate.test.mjs") },
  { name: "guard-human-override-tests", file: join(pluginScriptsDir, "guard-human-override.test.mjs") },
  { name: "po-human-approval-tests", file: join(pluginScriptsDir, "po-human-approval.test.mjs") },
```

### Batch 7 — `other` (38 suites, 3446 ms)

```js
  { name: "network-lockdown-tests", file: join(scriptDir, "network-lockdown.test.mjs") },
  { name: "pipeline-state-external-push-ledger-tests", file: join(scriptDir, "pipeline-state-external-push-ledger.test.mjs") },
  { name: "agent-decision-journal-tests", file: join(libDir, "agent-decision-journal.test.mjs") },
  { name: "async-execution-tests", file: join(libDir, "async-execution.test.mjs") },
  { name: "authority-revision-proof-tests", file: join(libDir, "authority-revision-proof.test.mjs") },
  { name: "credential-lease-tests", file: join(libDir, "credential-lease.test.mjs") },
  { name: "critical-action-approval-request-tests", file: join(libDir, "critical-action-approval-request.test.mjs") },
  { name: "external-command-offer-tests", file: join(libDir, "external-command-offer.test.mjs") },
  { name: "forge-capability-tests", file: join(libDir, "forge-capability.test.mjs") },
  { name: "gate-estimate-tests", file: join(libDir, "gate-estimate.test.mjs") },
  { name: "local-worker-pool-tests", file: join(libDir, "local-worker-pool.test.mjs") },
  { name: "plan-spec-state-v2-tests", file: join(libDir, "plan-spec-state-v2.test.mjs") },
  { name: "remote-provisional-receipt-tests", file: join(libDir, "remote-provisional-receipt.test.mjs") },
  { name: "ruleset-source-tests", file: join(libDir, "ruleset-source.test.mjs") },
  { name: "security-capability-plan-builder-tests", file: join(libDir, "security-capability-plan-builder.test.mjs") },
  { name: "security-completeness-gate-tests", file: join(libDir, "security-completeness-gate.test.mjs") },
  { name: "security-evidence-v1-migration-fixture-tests", file: join(libDir, "security-evidence-v1-migration-fixture.test.mjs") },
  { name: "source-observation-tests", file: join(libDir, "source-observation.test.mjs") },
  { name: "stack-capability-plan-tests", file: join(libDir, "stack-capability-plan.test.mjs") },
  { name: "ai-assisted-hardening-gate-tests", file: join(pluginScriptsDir, "ai-assisted-hardening-gate.test.mjs") },
  { name: "antigravity-alpha-adapter-tests", file: join(pluginScriptsDir, "antigravity-alpha-adapter.test.mjs") },
  { name: "check-close-security-completeness-tests", file: join(pluginScriptsDir, "check-close-security-completeness.test.mjs") },
  { name: "check-completeness-vocabulary-doclint-tests", file: join(pluginScriptsDir, "check-completeness-vocabulary-doclint.test.mjs") },
  { name: "check-release-state-consistency-tests", file: join(pluginScriptsDir, "check-release-state-consistency.test.mjs") },
  { name: "critic-route-activation-tests", file: join(pluginScriptsDir, "critic-route-activation.test.mjs") },
  { name: "critic-t1-po-override-tests", file: join(pluginScriptsDir, "critic-t1-po-override.test.mjs") },
  { name: "live-runner-certification-tests", file: join(pluginScriptsDir, "live-runner-certification.test.mjs") },
  { name: "native-plugin-readback-tests", file: join(pluginScriptsDir, "native-plugin-readback.test.mjs") },
  { name: "neutral-range-plan-tests", file: join(pluginScriptsDir, "neutral-range-plan.test.mjs") },
  { name: "pipeline-state-reopen-design-tests", file: join(pluginScriptsDir, "pipeline-state-reopen-design.test.mjs") },
  { name: "po-guarded-push-tests", file: join(pluginScriptsDir, "po-guarded-push.test.mjs") },
  { name: "public-baseline-diagnose-tests", file: join(pluginScriptsDir, "public-baseline-diagnose.test.mjs") },
  { name: "ruleset-update-policy-tests", file: join(pluginScriptsDir, "ruleset-update-policy.test.mjs") },
  { name: "run-codex-isolation-control-decomposition-tests", file: join(pluginScriptsDir, "run-codex-isolation-control-decomposition.test.mjs") },
  { name: "runner-contracts.schema-tests", file: join(pluginScriptsDir, "runner-contracts.schema.test.mjs") },
  { name: "verify-topology-preflight-tests", file: join(pluginScriptsDir, "verify-topology-preflight.test.mjs") },
  { name: "worktree-target-binding-tests", file: join(pluginScriptsDir, "worktree-target-binding.test.mjs") },
  { name: "critic-review-scope-tests", file: join(repoRoot, "plugins", "pipeline-core", "skills", "critic-review", "critic-review-scope.test.mjs") },
```

### Batch 8 — policy / audit (8 suites, 554 ms)

```js
  { name: "audit-bundle-core-tests", file: join(libDir, "audit-bundle.test.mjs") },
  { name: "change-control-core-tests", file: join(libDir, "change-control.test.mjs") },
  { name: "control-catalog-migration-tests", file: join(libDir, "control-catalog-migration.test.mjs") },
  { name: "organization-policy-activation-tests", file: join(libDir, "organization-policy-activation.test.mjs") },
  { name: "organization-policy-core-tests", file: join(libDir, "organization-policy.test.mjs") },
  { name: "audit-bundle-cli-tests", file: join(pluginScriptsDir, "audit-bundle.test.mjs") },
  { name: "change-control-cli-tests", file: join(pluginScriptsDir, "change-control.test.mjs") },
  { name: "organization-policy-cli-tests", file: join(pluginScriptsDir, "organization-policy.test.mjs") },
```

### Batch 9 — `publication-*`/`provenance-*` (8 suites, 2364 ms)

```js
  { name: "publication-state-authority-tests", file: join(scriptDir, "publication-state-authority.test.mjs") },
  { name: "provenance-release-binding-tests", file: join(libDir, "provenance-release-binding.test.mjs") },
  { name: "publication-authority-tests", file: join(libDir, "publication-authority.test.mjs") },
  { name: "publication-bundle-v2-tests", file: join(libDir, "publication-bundle-v2.test.mjs") },
  { name: "publication-bundle-tests", file: join(libDir, "publication-bundle.test.mjs") },
  { name: "publication-capability-preflight-tests", file: join(libDir, "publication-capability-preflight.test.mjs") },
  { name: "publication-close-journal-tests", file: join(pluginScriptsDir, "publication-close-journal.test.mjs") },
  { name: "publication-executor-v2-tests", file: join(pluginScriptsDir, "publication-executor-v2.test.mjs") },
```

### Batch 10 — reference catalog (4 suites, 305 ms)

```js
  { name: "external-reference-adapter-tests", file: join(libDir, "external-reference-adapter.test.mjs") },
  { name: "reference-catalog-views-tests", file: join(libDir, "reference-catalog-views.test.mjs") },
  { name: "reference-catalog-tests", file: join(libDir, "reference-catalog.test.mjs") },
  { name: "external-reference-tests", file: join(pluginScriptsDir, "external-reference.test.mjs") },
```

### Batch 11 — security adapters + scan v2 (6 suites, 1897 ms)

```js
  { name: "gitleaks-tests", file: join(scriptDir, "security-adapters", "gitleaks.test.mjs") },
  { name: "license-check-tests", file: join(scriptDir, "security-adapters", "license-check.test.mjs") },
  { name: "osv-scanner-tests", file: join(scriptDir, "security-adapters", "osv-scanner.test.mjs") },
  { name: "semgrep-tests", file: join(scriptDir, "security-adapters", "semgrep.test.mjs") },
  { name: "security-readiness-harness-tests", file: join(scriptDir, "security-readiness", "security-readiness.test.mjs") },
  { name: "security-scan-v2-integration-tests", file: join(scriptDir, "security-scan-v2-integration.test.mjs") },
```

### Batch 12 — this dispatch's own checker suite (1 suite, unmeasured by the classification report — proven directly by this dispatch's own CLI-level and function-level tests, see `evidence/verify-evidence-PHX-REGCHECK.json`)

```js
  { name: "verify-suite-registration-tests", file: join(scriptDir, "check-verify-suite-registration.test.mjs") },
```

### Batch 13 — the checker registered as a LIVE verify step (1 step, unmeasured — a gate step, not a suite)

The 102 green suites plus Batch 12's unit-test entry prove the checker's
*parsing logic* runs correctly inside the gate, but only a live `-check` step
makes verify itself go non-zero when a future `*.test.mjs` file is added
without a registration entry — which is what AC-P2 and AC-P3 literally
require. Without this entry the gate reports nothing when the invariant is
violated, and the defect is caught only by someone running the checker by
hand. This follows the established `<name>-tests` / `<name>-check` pairing
convention already used elsewhere in `TEST_SUITES` (e.g.
`doc-contract-tests`/`doc-contract-check` at verify.mjs:372-373,
`authority-tier-agreement-tests`/`-check` at :374-375).

```js
  { name: "verify-suite-registration-check", file: join(scriptDir, "check-verify-suite-registration.mjs") },
```

## Batch totals cross-check

13 batches, 6 + 2 + 6 + 3 + 18 + 3 + 38 + 8 + 8 + 4 + 6 + 1 + 1 = **104**. Sum of
batches 1-11's runtimes: 1406 + 2678 + 998 + 222 + 2350 + 588 + 3446 + 554 +
2364 + 305 + 1897 = **16808 ms** (16.8 s), matching the classification report's
"total runtime for the green set is 16.8 seconds" exactly. Batch 12 adds one
new, previously-unmeasured suite; Batch 13 adds one new, previously-unmeasured
gate step (the checker's own CLI invocation, not a `*.test.mjs` suite).

## Application note (for whoever applies this under the TP-3 window)

All 104 lines (Batches 1-13) are appended to `TEST_SUITES` — insert the
batches as a contiguous block immediately before the array's closing `];`
(today at `harness/scripts/verify.mjs:437`; re-confirm the exact line at
application time, since intervening TP-3 registrations may have moved it). No
other file changes. Immediately after applying, re-run
`node harness/scripts/check-verify-suite-registration.mjs` — it should report
`0 unregistered` (the current 7 exclusions being the only files legitimately
outside the arrays) and `node harness/scripts/verify.mjs` should show a
registered-step count of 363 (259 + 104) for the three arrays plus whatever
`PHASE_STEPS` this checkout carries.

### Post-application verification procedure (AC-P1, AC-P2, AC-P3)

Run in this order, inside the same TP-3 window that applies the patch — steps
2 and 3 both mutate the freshly-patched `verify.mjs` or its neighborhood and
must be fully restored before the window closes or any verify evidence is
regenerated for a commit.

1. **AC-P1 — registered-step count and clean exit.**
   ```
   node harness/scripts/verify.mjs
   ```
   Expect exit 0 (or every non-zero step named with a filed owner, per
   AC-P1's own wording) and a registered-step count of **363** — re-derived
   above from 259 currently-registered entries + 104 lines this patch adds;
   this run's own output is the actual evidence, not this stated expectation.

2. **AC-P2 — break and restore: an unregistered suite must fail the gate.**
   Create one empty, syntactically valid `*.test.mjs` file under a registered
   root, e.g.:
   ```
   printf '%s\n' "import { test } from 'node:test';" "test('placeholder', () => {});" > harness/scripts/_phx-regpatch-13-probe.test.mjs
   node harness/scripts/check-verify-suite-registration.mjs
   ```
   Expect a non-zero exit and an UNREGISTERED finding naming
   `harness/scripts/_phx-regpatch-13-probe.test.mjs` explicitly. Then restore:
   ```
   rm harness/scripts/_phx-regpatch-13-probe.test.mjs
   node harness/scripts/check-verify-suite-registration.mjs
   ```
   Expect exit 0 again. The probe file must be deleted before any commit and
   before any verify evidence is regenerated — it is scratch, not a
   deliverable.

3. **AC-P3 — break and restore: a duplicate suite id must fail the gate,
   named.** This break necessarily edits `harness/scripts/verify.mjs` itself,
   which is TP-3-protected; it must therefore happen inside this same
   maintenance window, immediately after step 1's confirming run, and be
   fully reverted before the window closes. Duplicate the last entry appended
   by Batch 13 (or any single `TEST_SUITES` line) verbatim immediately below
   itself, e.g. duplicating:
   ```
     { name: "verify-suite-registration-check", file: join(scriptDir, "check-verify-suite-registration.mjs") },
   ```
   then run:
   ```
   node harness/scripts/check-verify-suite-registration.mjs
   ```
   Expect a non-zero exit and a DUPLICATE-NAME finding naming
   `verify-suite-registration-check` explicitly (per the checker's own
   contract, header comment lines ~32-38: "names every duplicate it finds").
   Then restore by deleting the duplicated line so `verify.mjs` returns to
   exactly the 104-line-patched state, and re-run:
   ```
   node harness/scripts/check-verify-suite-registration.mjs
   ```
   Expect exit 0 again before the TP-3 window closes.
