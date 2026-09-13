# Briefed Test-Change Authorization & Per-Key TOFU Trust Anchors (WP-B2-1, WP-B2-4) — Verification Evidence

Checkpoint: 2026-09-13.
Task: `ALF-B2-1-4-GUARD-OVERRIDE-TRUST`
Governing Spec: `specs/sprint-alfred-epic/spec.md` §5.2 items 1 & 4
Acceptance Criteria: AC-11
Issues & Backlog Items:
- `backlog/items/2026-08-08-the-test-path-guard-blocks-the-briefed-edit-and-offers-no-route.md`
- `backlog/items/2026-08-09-critical-human-proof-policy-seeded-without-trust-anchor.md`

---

## 1. Executive Summary

This deliverable implements Briefed Test-Change Authorization (WP-B2-1, Spec §5.2 item 1, AC-11) and Per-Key Trust-On-First-Use (TOFU) Trust Anchors (WP-B2-4, Spec §5.2 item 4), resolving two long-standing security/lifecycle backlog items:

1. **Briefed Test-Change Authorization (`pipeline.briefed-test-authorization.v1`)**:
   - Implemented in `plugins/pipeline-core/lib/human-guard-override.mjs` with action/intent kind `briefed-test-change`.
   - Binds `{ targetPath, briefingDigest, expiry }` into an audited, tamper-evident authorization record stored in `.git/agent-pipeline/human-guard-overrides/briefed-authorizations/`.
   - Provides functions: `createBriefedTestChangeAuthorization`, `readActiveBriefedTestAuthorizations`, `checkBriefedTestChangeAdmitted`, `isBriefedTestChangeEligible`.
   - Wired into `plugins/pipeline-core/hooks/guard-testpath.mjs`:
     - Checks active briefed test-change authorization matching target path and dispatch briefing digest before HGO consumption.
     - Differentiates refusal guidance when blocked: emits `Briefed test-change route: route-available-via-briefed-authorization` for eligible test files, vs `Briefed test-change route: no-route-for-this-target` for non-test files.
     - Never permits non-test kernel or production paths through this lane.

2. **Per-Key TOFU Trust Anchors (WP-B2-4)**:
   - When running in `signature` push/override approval mode and an unrecognized well-formed Ed25519 key signs an override or critical proof, `authorizeHumanGuardOverrideBySignature` emits typed error code `HGO-TRUST-ANCHOR-NEW-KEY-CONFIRMATION-REQUIRED`.
   - Requires explicit human confirmation before first use instead of silently failing `HGO-TRUST-ANCHOR-MISSING` or unconditionally accepting arbitrary keys.
   - `plugins/pipeline-core/lib/critical-human-proof-policy.mjs`:
     - Added `confirmTrustAnchorKey({ rootDir, keyReference, publicKeySha256 })` and `storeConfirmedTrustAnchor()`.
     - Added `isRecognizedTrustAnchorKey({ rootDir, publicKeySha256 })`.
     - Supports storing confirmed keys in `trustAnchors[]` inside `project/critical-human-proof.json`.

---

## 2. Implemented Capabilities & APIs

### 2.1 Briefed Test-Change Authorization
- Constant `BRIEFED_TEST_AUTHORIZATION_SCHEMA = "pipeline.briefed-test-authorization.v1"`
- Constant `BRIEFED_TEST_CHANGE_KIND = "briefed-test-change"`
- `createBriefedTestChangeAuthorization({ rootDir, targetPath, briefingDigest, expiry, mode, reason, proof, trustPolicy, nowMs, spawn })`:
  - Validates `targetPath`, `briefingDigest` (64-character SHA-256), and `expiry` (future timestamp).
  - In `signature` mode, validates Ed25519 proof against intent and trust policy.
  - Stores atomic authorization record under `storage(repo.common).briefedAuthorizations`.
- `checkBriefedTestChangeAdmitted({ rootDir, targetPath, briefingDigest, nowMs, spawn })`:
  - Checks if an unexpired authorization exists for `targetPath`.
  - If `briefingDigest` is provided, enforces exact match.
- `isBriefedTestChangeEligible(filePath, { rootDir, livePluginRoot })`:
  - Returns `true` only for test/spec files matching `\.(?:test|spec)\.[cm]?[jt]sx?$`.
  - Strictly rejects `NEVER_LIFTABLE_KERNEL_PATHS`.

### 2.2 Per-Key TOFU Trust Anchors
- Error code `HGO-TRUST-ANCHOR-NEW-KEY-CONFIRMATION-REQUIRED` (`HGO_TRUST_ANCHOR_NEW_KEY_CONFIRMATION_REQUIRED`).
- Exported helper functions:
  - `confirmTrustAnchorKey({ rootDir, keyReference, publicKeySha256, filePath })`: appends newly confirmed anchor to `trustAnchors` in `project/critical-human-proof.json`.
  - `isRecognizedTrustAnchorKey({ rootDir, publicKeySha256 })`: returns boolean indicating whether key digest is recognized.
- In `authorizeHumanGuardOverrideBySignature`:
  - Evaluates proof against `trustAnchors[]`.
  - If key is unrecognized in v3 policy, throws `HGO-TRUST-ANCHOR-NEW-KEY-CONFIRMATION-REQUIRED` with payload `{ keyReference, publicKeySha256 }`.
  - After human confirmation via `confirmTrustAnchorKey()`, subsequent override attempts succeed and arm the capability.

---

## 3. Test Verification & Results

1. **`plugins/pipeline-core/lib/human-guard-override.test.mjs`**:
   - 135/135 tests passing (0 failures).
   - Verifies:
     - `WP-B2-4: an EMPTY v3 trustAnchors array with an unrecognized well-formed key requires TOFU confirmation (HGO-TRUST-ANCHOR-NEW-KEY-CONFIRMATION-REQUIRED)`
     - `WP-B2-4: an unrecognized well-formed key emits HGO-TRUST-ANCHOR-NEW-KEY-CONFIRMATION-REQUIRED, and succeeds after TOFU confirmation`
     - `WP-B2-4: a malformed Ed25519 key fails with HGO-PROOF-INVALID`
     - `WP-B2-1: createBriefedTestChangeAuthorization lifecycle, query, and eligibility`
     - All legacy singular and signature admission tests preserved.

2. **`plugins/pipeline-core/hooks/guard-testpath.test.mjs`**:
   - 18/18 test cases passing (0 failures).
   - Verifies:
     - `TP15 block: test path refusal clearly states route-available-via-briefed-authorization`
     - `TP16 block: non-test path refusal clearly states no-route-for-this-target`
     - `TP17 allow: briefed test-change authorization admits exact target with matching digest`
     - `TP18 block: briefed test-change authorization blocks when presenting mismatching digest`

3. **`plugins/pipeline-core/lib/critical-human-proof-policy.test.mjs`**:
   - 35/35 test cases passing (0 failures).
   - Full backward compatibility maintained for v1 singular anchors and v2 waivers.

4. **Backlog Done Predicate Verification**:
   - `check-backlog-done-predicate.mjs`:
     - `contains plugins/pipeline-core/lib/human-guard-override.mjs briefed-test-change` -> SATISFIED.
     - `contains plugins/pipeline-core/lib/human-guard-override.mjs HGO-TRUST-ANCHOR-NEW-KEY-CONFIRMATION-REQUIRED` -> SATISFIED.
