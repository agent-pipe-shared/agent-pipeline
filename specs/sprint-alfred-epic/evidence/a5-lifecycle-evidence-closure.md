# Closed-Evidence Integrity & Repair and Authority Worktree/HEAD Divergence (WP-A5-i, WP-A5-iii) — Verification Evidence

Checkpoint: 2026-09-14
Task: `ALF-A5-EVIDENCE-CLOSURE`
Governing Spec: `specs/sprint-alfred-epic/spec.md` §4.5 (WP-A5-i, WP-A5-iii)
Acceptance Criteria: AC-5, IR-1
Issues & Backlog Items:
- `backlog/items/2026-08-27-a-closed-result-can-be-amended-after-close-with-no-detection-and-no-repair.md`
- `backlog/items/2026-08-08-the-authority-gate-reads-the-worktree-so-its-verdict-need-not-survive-a-checkout.md`

---

## 1. Executive Summary

This deliverable implements Closed-Evidence Integrity & Repair (WP-A5-i, Spec §4.5 item 1, AC-5, IR-1) and Authority Worktree/HEAD Divergence Checking (WP-A5-iii, Spec §4.5 item 3, AC-5), resolving two core integrity and authority verification backlog items:

1. **Closed-Evidence Integrity & Repair (WP-A5-i)**:
   - **Continuous Integrity Verification**: In `plugins/pipeline-core/lib/onboarding-continuity.mjs`, `classifyOnboardingContinuity()` and `detectClosedEvidenceDrift()` verify `closedFeatures` result and close-evidence bindings on every branch that reads state.
   - **Active Branch Leniency**: If closed-evidence drift is detected on an active feature branch, a diagnostic code `CLOSED-EVIDENCE-DRIFT` is emitted naming the affected `featureId`, `artifact`, `expectedSha256`, and `observedSha256`. Crucially, session readiness is NOT failed (`status: "valid"`), ensuring active feature delivery is not held hostage to historical closed drift.
   - **Inactive Branch Fail-Closed**: On inactive, closed, or discarded feature branches, any closed-evidence drift causes continuity classification to fail closed as `status: "damaged"`, preventing subsequent lifecycle transitions until repaired.
   - **PO-Gated Repair Verbs**: Implemented two repair paths in `plugins/pipeline-core/scripts/pipeline-state.mjs` under schema `pipeline.closed-evidence-repair.v1`:
     - `closed-evidence-restore-plan` & `closed-evidence-restore-apply --activate`: Restores the pinned file bytes from the recorded `forCommit` git history via `git show <closeCommit>:<path>`.
     - `closed-evidence-repin-plan` & `closed-evidence-repin-apply --activate --by <poName>`: Re-pins the artifact hash in `closedFeatures[].continuityClose` to match the worktree, and records an immutable audit record in `state.evidenceRepins[]` (`{ featureId, artifactPath, oldSha256, newSha256, repinnedAt, by }`).
   - **Audit Trail Validation**: Updated continuity repair validator `validStateRepairRecords()` to validate `evidenceRepins[]` entries for required non-empty string fields and valid sha256 digests.
   - **CLI Tool**: Added `plugins/pipeline-core/scripts/check-evidence-drift.mjs` supporting `--root <dir>` and `--format json|text` options.

2. **Authority Worktree/HEAD Divergence Checking (WP-A5-iii)**:
   - Implemented `checkPoGateAuthority()` in `plugins/pipeline-core/scripts/pipeline-state.mjs` (wired as default `deps.poGateAuthority`).
   - Compares worktree bytes of each authority surface (PRD, Spec, Design, Constraints, State) against HEAD via `git show HEAD:<path>`.
   - Emits diagnostic warning `AUTHORITY-WORKTREE-HEAD-DIVERGENCE` (`missing-in-head`, `missing-in-worktree`, or `differs`) without hard failure, respecting that pre-commit authority checks legitimately occur before git commit.
   - Evaluates PRD cardinality independently per view (`worktree` and `head`), reporting exact PRD counts and detecting partial staging or uncommitted renames/deletions.

---

## 2. Deliverables & Capability Inventory

- **`plugins/pipeline-core/lib/onboarding-continuity.mjs`**:
  - Exported `detectClosedEvidenceDrift(root, state)`.
  - Added `validEvidenceRepinEntry()` in `validStateRepairRecords()`.
  - Updated `observeDetailed()` to calculate closed-evidence drifts, emit `CLOSED-EVIDENCE-DRIFT` diagnostics, maintain `status: "valid"` when `activeFeature` is present, and set `status: "damaged"` on inactive branches.
- **`plugins/pipeline-core/scripts/pipeline-state.mjs`**:
  - Subcommands registered: `closed-evidence-restore-plan`, `closed-evidence-restore-apply`, `closed-evidence-repin-plan`, `closed-evidence-repin-apply`.
  - Schema exported: `CLOSED_EVIDENCE_REPAIR_SCHEMA = "pipeline.closed-evidence-repair.v1"`.
  - Exported `checkPoGateAuthority({ repoRoot, deps })`.
- **`plugins/pipeline-core/scripts/check-evidence-drift.mjs`**:
  - Standalone utility and exported library function `checkEvidenceDrift()`.
- **`plugins/pipeline-core/scripts/check-evidence-drift.test.mjs`**:
  - Integration suite containing 5 comprehensive tests:
    1. Incident replay of 2026-08-27: active branch diagnostic vs inactive branch fail-closed.
    2. `closed-evidence-restore` flow from git history.
    3. `closed-evidence-repin` flow with state update and audit entry.
    4. Worktree/HEAD divergence checking and PRD cardinality per view.
    5. CLI tool verification in text and JSON formats.
- **Registrations**:
  - `harness/verify-suites.json`: registered `check-evidence-drift-tests`.
  - `docs/product-capability-inventory.json`: registered `verify-phase:harness/scripts/verify.mjs:check-evidence-drift-tests`.

---

## 3. Test & Verification Evidence

### 3.1 Unit & Integration Test Suite
```
$ node --test plugins/pipeline-core/scripts/check-evidence-drift.test.mjs
{
  "schema": "pipeline.closed-evidence-drift.v1",
  "ok": true,
  "status": "clean",
  "root": "/home/skar667/src/agent-pipeline-share_alfred/scratch/test-tmp/check-evidence-drift-cli-test-NwmMKO",
  "closedFeaturesCount": 1,
  "driftCount": 0,
  "drifts": []
}
No closed-evidence drift detected across 1 closed feature(s).
{
  "schema": "pipeline.closed-evidence-drift.v1",
  "ok": false,
  "status": "drift-detected",
  "root": "/home/skar667/src/agent-pipeline-share_alfred/scratch/test-tmp/check-evidence-drift-cli-test-NwmMKO",
  "closedFeaturesCount": 1,
  "driftCount": 1,
  "drifts": [
    {
      "code": "CLOSED-EVIDENCE-DRIFT",
      "featureId": "feat-1",
      "artifact": "specs/2026-07-27-agent-pipeline-0.4.7-hotfix/result.md",
      "path": "specs/2026-07-27-agent-pipeline-0.4.7-hotfix/result.md",
      "artifactKind": "result",
      "expectedSha256": "5465d1a362b96b6efeb0aa2fc58ca4fcf2ddc9da13e18a59991ab8ba41a8240d",
      "observedSha256": "7d975da01afa416d6a3a15a68eef0aee9a9fff939dc264303514d4118672b301",
      "status": "modified"
    }
  ]
}
Closed-evidence drift detected (1 issue(s) found):
  - CLOSED-EVIDENCE-DRIFT: feature "feat-1" artifact "specs/2026-07-27-agent-pipeline-0.4.7-hotfix/result.md" (expected 5465d1a362b96b6efeb0aa2fc58ca4fcf2ddc9da13e18a59991ab8ba41a8240d, observed 7d975da01afa416d6a3a15a68eef0aee9a9fff939dc264303514d4118672b301)
✔ 2026-08-27 incident replay: post-close amendment emits CLOSED-EVIDENCE-DRIFT diagnostic on active branch, and fails closed on inactive branch (37.755459ms)
✔ closed-evidence-restore restores pinned bytes from history (31.151338ms)
✔ closed-evidence-repin updates state with audit entry in evidenceRepins[] (36.058789ms)
✔ AUTHORITY-WORKTREE-HEAD-DIVERGENCE emitted when worktree and HEAD diverge (63.575977ms)
✔ check-evidence-drift CLI inspects and reports drift across closedFeatures (24.988824ms)
ℹ tests 5
ℹ suites 0
ℹ pass 5
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 294.489817
```

### 3.2 Harness Declarative Verification
```
$ node harness/scripts/check-verify-suite-registration.mjs
Verify suite registration is complete: 556 registered, 0 declared exclusion(s), 0 unregistered.
```

### 3.3 Consumer Safe Paths Verification
```
$ node --test harness/scripts/check-consumer-safe-paths.test.mjs
check-consumer-safe-paths: fixture and repository checks passed
✔ a fixture naming a source-only path fails (0.707646ms)
✔ a clean fixture passes (0.528817ms)
✔ an allowlisted occurrence passes (0.169799ms)
✔ a stale allowlist entry (never matches) is itself reported (0.184809ms)
✔ multiple prefix hits on one line each produce a finding (0.158959ms)
✔ SOURCE_ONLY_PREFIXES carries the backlog item's minimum set (0.136619ms)
✔ every ALLOWLIST entry is either a (file, match) pair or a filePattern, each with a non-empty stated reason (0.314458ms)
✔ current repository passes with the real ALLOWLIST (AC-11) (61.257742ms)
✔ real allowlisted (file, match) entries still exist and still contain the allowlisted substring (5.06301ms)
ℹ tests 9
ℹ suites 0
ℹ pass 9
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 116.683147
```

### 3.4 Git Diff Whitespace Verification
```
$ git diff --check
(clean, exit 0)
```
