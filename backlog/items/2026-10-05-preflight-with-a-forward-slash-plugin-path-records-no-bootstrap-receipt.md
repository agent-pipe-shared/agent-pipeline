---
schema: pipeline.backlog-item.v1
id: pipeline.preflight-with-a-forward-slash-plugin-path-records-no-bootstrap-receipt
type: defect
owner: pipeline
status: open
created: 2026-10-05
source: "Live observation 2026-10-05 (Alfred session, native Windows): ALFRED-BACKLOG-20261005 defect 11."
sprint: alfred
done_when: manual
---

# Preflight run with a forward-slash plugin path does not record the bootstrap receipt

## Description

Running `pipeline-start-preflight.mjs` with a forward-slash spelling of the plugin path on native Windows does not record the bootstrap receipt; the first Write then fails with `GUARD-BOOTSTRAP-RECEIPT-MISSING`. The backslash spelling of the same path works. The two spellings are the same file, so the receipt logic (or the guard's allowlist match of the invoked path) compares unnormalized strings.

## Triggering situation

Reproduction shape (native Windows, Claude): run the installed preflight as `node "D:/.../pipeline-core/scripts/pipeline-start-preflight.mjs"`, then attempt a Write. The briefing's explicit "backslash spelling" instruction exists because of this. Related: `2026-10-03-dispatch-budget-lock-refuses-every-subagent-call-on-windows.md` (same refusal code, different cause).

## Affected artifact

`plugins/pipeline-core/scripts/pipeline-start-preflight.mjs`, the receipt path derivation and the guard that admits the preflight invocation.

## Proposal

Normalize the script path (separator and case) before matching and before deriving the receipt key; accept both spellings; add a win32 regression test for both. Until then keep the backslash instruction in briefings.

## Findings 2026-10-05 (FSLASH diagnosis)

- The receipt key has no path component (`bootstrapReceiptPath`, keyed by `agentId`), so the
  "receipt path derivation" hypothesis is refuted. The near miss is the matcher:
  `isSanctionedStartPreflightInvocation` (`hooks/guard-lifecycle-ready.mjs` ~5474-5477) and the
  lifecycle admission `sanctionedLifecycleScriptArgs` (~5619) compare `script ===
  START_PREFLIGHT_SCRIPT` by strict string equality against `fileURLToPath(...)` (~252), i.e. the
  backslash, as-cased spelling only. Any other spelling of the same file records no receipt.
- Precedent in the same file (~1788-1797) matches by physical identity on win32 and keeps exact
  equality on POSIX.
- Proposed fix (not applied; guard is frozen): a `sameSanctionedScriptPath(spelled, sanctioned,
  platform)` helper that folds separators and, on win32 only, case; used at both sites. Dot
  segments, duplicate separators and other drive/dir/name still miss. Target after the S2 split:
  the `lib/guard` module that owns these functions, in S2 package 2 (behaviour changes), with the
  security Critic route for guard-surface changes.
- Regression test committed as `scripts/pipeline-start-preflight.path-spelling.test.mjs`: 5
  equivalence cases marked `todo` (red today), 6 must-stay-refused cases green. Drop the `todo`
  markers when the fix lands.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:**
- **Rationale:**
- **Assignment (if accepted):**
- **Date:**
