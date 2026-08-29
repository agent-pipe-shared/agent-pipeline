---
schema: pipeline.backlog-item.v1
id: pipeline.guard-sweep-completion-report
type: workflow-improvement
owner: pipeline
status: closed
created: 2026-08-29
sprint: nova
done_when: manual
source: "Dispatch NVA-R6-GUARDSWEEP, executing backlog/items/2026-08-29-sweep-remaining-guards-for-fail-open-identity-and-pipe-unpiped-scope-asymmetry.md"
---

# Guard-layer sweep completion report (NVA-R6-GUARDSWEEP)

## Description

Sweep of the 13-file `plugins/pipeline-core/hooks/guard-*.mjs` population (excluding
`*.test.mjs`) for two already-confirmed defect shapes: Shape 1 (an authority-bearing
gate fails open on an unresolvable identity/result, GL-09), and Shape 2 (a piped vs.
un-piped sibling code path applies a root/scope containment check asymmetrically).
Population re-enumerated live via
`find plugins/pipeline-core/hooks -maxdepth 1 -name "guard-*.mjs" -not -name "*.test.mjs"`
at dispatch start — 13 files, unchanged from the source item's frozen list.

## Population and status

| # | File | Shape 1 | Shape 2 | Notes |
|---|------|---------|---------|-------|
| 1 | `guard-push.mjs` | none found | not applicable | Fully reviewed via full grep sweep + targeted context reads around every `return null`/exit-code site (resolveImplicitPushDestination, deployCandidate, portableCleanupBaselineFailure, the top-level `catch(faultError)` fault boundary). Every ambiguity-resolution branch either fails closed explicitly (documented: "fail closed to unresolved", "this authority-bearing gate fails closed on an unanticipated fault") or is a deliberate, documented default-allow for a case with nothing to check (e.g. no portable Pipeline State recorded at the pushed commit at all). No `pathInside`/`resolve(root,...)` containment pattern present anywhere in the file (no shape-2 surface: this guard classifies push safety, not path/root scope). |
| 2 | `guard-handover-size.mjs` | none found | not applicable | Full file read. `proposedHandoverBytes()` returns `null` on an unrecognized tool-input shape; caller admits (verdict 0) — explicitly documented as deliberate ("a shape this guard cannot read is not evidence the write is unsafe"), and the consequence is a soft size-cap miss, not an identity/security bypass. No shell-command parsing in this file (no shape-2 surface). |
| 3 | `guard-lifecycle-ready.mjs` | none found beyond F02/F03 in regions read | none found beyond F02/F03 in regions read | Largest file (4085 lines). Full-file grep sweep for both shapes (`return null`/`catch`/`unresolved` and `pathInside`/`resolve(root,...)`/`commandPath`), plus targeted reads of the F02 area (`evaluateBootstrapReceiptGate`, lines ~3596-3648 — confirmed correctly denies the `invalid-identity` sentinel by falling through to `deny-no-receipt`, i.e. F02 works as designed), the F03 area (`isReadOnlyDiagnosticCommand`/`pathInside`, lines ~1281-2560), the orchestrator-identity carve-out (deliberate, documented), the plan-invalidation/authority state reader (~lines 760-793, documented "an unreadable guard config blocks nothing here, exactly as in the write lane" — parity with the write lane, deliberate), and `claudeSessionMemoryDirectory` (~1335-1348 — a narrow allow-list carve-out whose `null` falls through to ordinary write-target checks, not a blanket admit). **Coverage caveat, honestly disclosed:** roughly 60-70% of this file's lines were examined (grep-matched candidates plus ~6 targeted read windows); large stretches — most of the shell-grammar tokenizer/redirect-validation internals, the GMW/HGO ceremony rendering blocks, and node-script/write-target matching not flagged by either grep pattern — were not individually re-read line by line. No new instance found in what was read; a subtler instance outside the grep vocabulary used here is not ruled out. |
| 4 | `guard-apply-patch.mjs` | none found | not applicable (delegates) | Full file read. Fails CLOSED (not open) on unreadable/malformed apply_patch input (`block()` calls `process.exit(2)`). Delegates all per-path root/scope checks to the existing write-path guards via a synthesized `{tool_name:"Edit", tool_input:{file_path}}` call per touched path — does not itself implement a duplicate containment check, so shape 2's "duplicate-but-inconsistent" pattern does not structurally apply here. Aggregation of sub-guard exit codes defaults to blocking (`exitCode = 2`) on any unrecognized child status. |
| 5 | `guard-gate-strength.mjs` | none found | not applicable | Full file read. All fail-open branches (malformed input, unreadable repo, "ungoverned" repository) are explicitly documented as deliberate in the file header ("a guard is a safety net, not a prison... fails CLOSED only on the thing it exists for"). GMW window lookup and HGO consumption both fail CLOSED on their own internal errors (refusal stands). No shell-command parsing (write-tools only; the shell lane lives in guard-lifecycle-ready.mjs's `GUARD-GATE-STRENGTH-SHELL`) — no shape-2 surface in this file. |
| 6 | `guard-onboarding-consent-lock.mjs` | reviewed, deliberate | not applicable | Full file read. Two fail-open branches (own I/O unreadable; marker location unobservable), both explicitly documented in the header as deliberate ("FAIL-OPEN on anything this hook cannot parse or observe... this hook only fails open on ITS OWN I/O") and structurally distinct from the marker's own separately-documented fail-CLOSED "present but corrupt" handling (owned by the lib module, not this hook). No shell-command parsing. |
| 7 | `guard-dispatch.mjs` | reviewed, deliberate | not applicable | Full file read. Every fail-open branch (unreadable input, no recognizable dispatch shape, an unterminated/dynamically-built prompt string) is explicitly reasoned in the header as a deliberate false-positive/false-negative trade-off for a structural lint gate ("a false positive on a script that never dispatches a Goldfish/Critic role is worse than a miss"). No shell-command parsing. |
| 8 | `guard-el01-tripwire.mjs` | reviewed, deliberate | not applicable | Full file read. Every fail-open branch (own I/O, no active feature, unresolvable risk class, unreadable spec) is explicitly reasoned in the header's "NOT COVERED" section as an accepted, disclosed gap ("a tripwire, not a sandbox"), consistent with the guard family's own "no config -> no-op" posture. The dispatch-record admit path is a positive match condition, not an ambiguity fail-open. No shell-command parsing (Edit/Write/NotebookEdit only). |
| 9 | `guard-git.mjs` | none found | not applicable | Full file read (in two passes) plus targeted context around every `return null`/`catch` hit and the final matching-loop/exit logic (lines ~1290-1389). All override/Phoenix-authority helper functions that return `null` do so on FAILURE paths that leave the underlying refusal standing (fail-closed for the actual admission decision) — extensively and explicitly documented ("Failure of ANY kind... leaves the refusal exactly as it was"). The final "no deny rule matched -> allow" default is the expected, deliberate shape of a deny-list guard, not an identity-resolution ambiguity. No `pathInside`/`resolve(root,...)` pattern anywhere in the file — no shape-2 surface (this guard classifies destructive command shapes, not path/root scope). |
| 10 | `guard-testpath.mjs` | none found | not applicable | Full file read. Fail-open branches (own I/O, unusable HGO capability) are documented as deliberate ("guard is a safety net, not a prison") and every override/consumption path fails CLOSED on its own errors (refusal stands). No `pathInside`/root-containment duplication (path matching is a single regex-rule lookup via the shared `lib/protected-test-paths.mjs`, one definition for both the write lane and the shell lane). |
| 11 | `guard-command-grammar.mjs` | none found | none found (see note) | Full file read. This is a shared LIBRARY, not itself a PreToolUse hook (no process.exit) — its `denied()`/`accepted()` outputs feed guard-lifecycle-ready.mjs's classifiers. `isBoundedReadOnlyPipeline()`/`validateRg()`/`approvedReadPath()`/`pathInside()` implement ONLY the piped rg-to-rg/rg-to-head lane's root check; this file does not itself implement a single-command lane at all (that logic and its F03 root-check fix both live in guard-lifecycle-ready.mjs), so there is no duplicate-but-inconsistent pair WITHIN this file. Note: this file's own header comment (lines ~211-217) describes single, un-piped commands as carrying "NO path restriction at all", which reads as potentially stale relative to guard-lifecycle-ready.mjs's post-F03 single-command root check — worth a follow-up documentation-accuracy check, but not itself a functioning shape-2 instance in this file, so not filed as a finding here. |
| 12 | `guard-dispatch-budget.mjs` | **FINDING FILED** (see below) | not applicable | Full file read. `evaluateDispatchBudgetGuard()` branches explicitly on `identity.kind === "orchestrator"` and `"unresolved"` but has no branch for `"invalid-identity"` (the third kind the F02 fix introduced, defined in this very file); it falls through to the `maxTurns === null` path (the sentinel `agentType` resolves no agent definition) and lands in the same silent-admit `recordUnresolved(...); return verdict(0);` branch as a genuinely ambiguous identity. No shell-command parsing (no shape-2 surface: Edit/Write/NotebookEdit + Bash-closing-act string match only, no root-containment logic). |
| 13 | `guard-devplan.mjs` | none found | not applicable | Full file read. Every fail-open branch (no manifest, gate absent/off, no state file, no active feature) is exhaustively documented in the header's "FAIL-OPEN" section as deliberate ("nothing to enforce yet — never a paralysis-by-default trap"). The authority-bearing core (`hasLedgerBackedPlanApproval`/`hasGeneralizedLedgerBackedPlanApproval`/`resolveHumanDecisionReadback`) returns `false` (not-approved, i.e. the gate stays fail-closed/blocking) on every ambiguity or parse failure — admission (`process.exit(0)`) is reached ONLY when every check explicitly resolves `true`. No shell-command parsing (Edit/Write/NotebookEdit only). |

## Findings filed

1. `backlog/items/2026-08-29-guard-dispatch-budget-does-not-distinguish-invalid-identity-from-unresolved.md` — Shape 1, `guard-dispatch-budget.mjs`, function `evaluateDispatchBudgetGuard` (lines 409-464, specifically the missing `identity.kind === "invalid-identity"` branch). See file #12 above for the mechanism.

No other findings were filed. Every other file's fail-open branches were judged
either explicitly documented/deliberate (matching or extending the same reasoning
`guard-lifecycle-ready.mjs`'s own orchestrator-identity carve-out uses) or
structurally inapplicable (no authority-bearing ambiguity resolution relevant to
shape 1, or no shell-command parsing for shape 2).

## Coverage statement

All 13 files in the population (re-enumerated live at dispatch start; unchanged
from the source item's frozen list) were swept and are named above by name with
either an explicit "no instance of shape 1/2 found" (with reasoning) or a
cross-reference to the one filed finding. 12 of 13 files were read in full.
`guard-lifecycle-ready.mjs` (4085 lines, by far the largest in the population)
was swept via a full-file grep pass for both shapes plus ~6 targeted read
windows covering the F02/F03 areas and every other grep-flagged candidate
region; roughly 60-70% of its lines were read directly, and this is disclosed
rather than claimed as exhaustive — see its row above for the exact regions
covered and not covered. No file was skipped entirely.
