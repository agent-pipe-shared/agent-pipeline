# Governance Triple (WP-B2-7, Attended PO Ack Runner, Elephant Design Trailer) — Verification Evidence

Checkpoint: 2026-09-14
Task: `ALF-B2-7-GOVERNANCE-TRIPLE`
Governing Spec: `specs/sprint-alfred-epic/spec.md` (Governance Triple)
Acceptance Criteria: AC-2, AC-2b, AC-5
Issues & Backlog Items:
- `backlog/items/2026-08-11-critic-route-pre-check-not-in-force-in-installed-plugin.md` (WP-B2-7: Repo-live vs runtime-live disclosure)
- `backlog/items/2026-08-28-the-attended-po-acknowledge-gate-defaults-to-a-runner-that-cannot-satisfy-it.md` (Attended PO acknowledge runner resolution & diagnostic)
- `backlog/items/2026-08-27-no-sanctioned-dispatch-trailer-form-exists-for-direct-elephant-design-commits.md` (Sanctioned trailer: `Dispatch: design (elephant)`)

---

## 1. Executive Summary

This deliverable implements the Governance Triple closing 3 open Alfred backlog items:
1. **Repo-live vs Runtime-live Disclosure Note (WP-B2-7)**:
   - In `plugins/pipeline-core/scripts/pipeline-start-preflight.mjs`, added `observeDutyNotRuntimeLive()` comparing checkout plugin files against installed plugin files for agents, skills, and templates when both roots are known.
   - When differences exist (e.g. agent prompt or skill edits in repository checkout that have not yet been republished/reinstalled into the running plugin cache), preflight surfaces `dutyNotRuntimeLive: { status: "differing", diagnostic: "DUTY-NOT-RUNTIME-LIVE", differingFiles: [...] }`.
   - When identical or matching, preflight surfaces `dutyNotRuntimeLive: { status: "in-force" }`.
   - Preserves backward compatibility and payload size budgets without blocking readiness.

2. **Attended PO Acknowledge Runner Resolution & Diagnostics**:
   - In `plugins/pipeline-core/scripts/pipeline-state.mjs`, updated `buildPoAuthorityAcknowledgePlan()` to record the resolved runner (`runner: runnerResolved.runner`) into the plan `payload`.
   - In `runPoAuthorityAcknowledgeCommand()`'s `po-authority-acknowledge-apply` handler, if `apply.runner` is omitted (e.g. human running the command in an attended terminal with no `--runner` flag and no agent environment variables), the handler reconstructs candidate plans to match `apply.planSha256` and extracts `runner = testPlan.payload.runner`.
   - If still unresolvable, emits the existing refusal `PO-REBIND-RUNNER-UNKNOWN`.
   - Postimage readback failures clearly render failing predicate summaries (`${predicateSummary}`) to stderr, identifying the exact failing predicate and expected/observed values.

3. **Sanctioned Elephant Design Trailer (`Dispatch: design (elephant)`)**:
   - In `harness/scripts/generate-agent-obligations.mjs`, updated §6 to specify three legitimate `Dispatch:` trailer forms, adding `Dispatch: design (elephant)` for orchestrator direct commits of design-phase documents (`docs/`, `specs/`, `plans/`, `backlog/`, `evidence/`, `.claude/`, `scratch/`) with no dispatch record required.
   - Regenerated `templates/prompts/agent-obligations.md` and updated vendored copy `plugins/pipeline-core/templates/prompts/agent-obligations.md`, verified byte-identical by `generate-agent-obligations.test.mjs`.
   - In `plugins/pipeline-core/scripts/dispatch-authorship-verify.mjs`, exported `ELEPHANT_DESIGN_ID = "design"` and `ELEPHANT_DESIGN_PREFIXES`. When `dispatch.role === "elephant"` and `dispatch.id === ELEPHANT_DESIGN_ID`, verified that all changed paths reside under design prefixes. Returns `PASS` (`elephant-design-declared`) on valid design paths, and `UNVERIFIABLE` (`elephant-design-non-design-path`) if any non-design code or harness path is touched.

---

## 2. Deliverables & Capability Inventory

- **`harness/scripts/generate-agent-obligations.mjs` & `templates/prompts/agent-obligations.md`**:
  - Added `Dispatch: design (elephant)` definition in §6.
  - Pinned by `harness/scripts/generate-agent-obligations.test.mjs` (AC-2, AC-2b).
- **`plugins/pipeline-core/scripts/dispatch-authorship-verify.mjs` & `dispatch-authorship-verify.test.mjs`**:
  - Added `ELEPHANT_DESIGN_ID`, `ELEPHANT_DESIGN_PREFIXES`, and `isElephantDesignPath()`.
  - Added verification logic for `Dispatch: design (elephant)` ensuring touched files are restricted to design document prefixes.
  - Added unit tests in `dispatch-authorship-verify.test.mjs` testing PASS on design paths and UNVERIFIABLE on non-design paths.
- **`plugins/pipeline-core/scripts/pipeline-start-preflight.mjs` & `pipeline-start-preflight.test.mjs`**:
  - Exported `observeDutyNotRuntimeLive()`.
  - Embedded `dutyNotRuntimeLive` observation in preflight result envelope.
  - Added unit tests asserting `in-force`, `differing`, and `not-applicable` statuses.
- **`plugins/pipeline-core/scripts/pipeline-state.mjs` & `pipeline-state.test.mjs`**:
  - Added `runner` field to `buildPoAuthorityAcknowledgePlan()` plan payload.
  - Resolved runner in `po-authority-acknowledge-apply` from matching plan payload when `--runner` is omitted.
  - Stderr rendering of postimage failures with predicate summaries.
  - Added test in `pipeline-state.test.mjs` verifying apply succeeds without `--runner` by extracting runner from plan.

---

## 3. Test & Verification Evidence

### 3.1 `generate-agent-obligations.test.mjs`
```
✔ AC-2: the committed document is byte-identical to a fresh generation
✔ AC-2b: the vendored plugin copy is byte-identical to the canonical document
✔ AC-3 (drift): a protected path added at the source changes the generated document
✔ AC-4: every protected path appears verbatim, and the count is stated
✔ AC-4: the no-in-session-override fact is stated with its citation, not as folklore
✔ AC-3: the draft-phase exempt prefixes come from the guard's own constant
✔ AC-5: liftability is delegated to the repair map, never copied
✔ AC-9 (contract): the command §5 prints is the command the lifecycle guard admits
✔ AC-7: the document carries no absolute or machine-specific path
✔ AC-1: a hand-maintained line is marked as such, so the boundary is visible
ℹ tests 10 · pass 10 · fail 0
```

### 3.2 `dispatch-authorship-verify.test.mjs`
```
✔ Dispatch: design (elephant) PASSes for design-phase document paths with no record
✔ Dispatch: design (elephant) is UNVERIFIABLE if any non-design path is touched
✔ (e) the new declared Elephant form PASSes without any record
...
ℹ tests 56 · pass 56 · fail 0
```

### 3.3 `pipeline-start-preflight.test.mjs`
```
✔ observeDutyNotRuntimeLive reports in-force when roots are identical or match
✔ observeDutyNotRuntimeLive reports differing and lists differing files when modified
✔ observeDutyNotRuntimeLive reports not-applicable when roots are missing or null
✔ preflight reports exact identity and no-handoff without secret fields
...
ℹ tests 60 · pass 60 · fail 0
```

### 3.4 `pipeline-state.test.mjs`
```
✔ pipeline-state.test.mjs (CB-1a): all checks passed (including po-authority-acknowledge-plan payload runner and apply without --runner)
ℹ tests 1 · pass 1 · fail 0
```

### 3.5 Regression & Registration Gates
- `node harness/scripts/check-verify-suite-registration.mjs`: 556 registered, 0 exclusions, 0 unregistered.
- `git diff --check`: exits 0 with zero whitespace/newline warnings.
