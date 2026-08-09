---
schema: pipeline.backlog-item.v1
id: pipeline.pipeline-state-scripts-test-file-never-runs-in-full-verify
type: defect
owner: pipeline
status: closed
created: 2026-08-09
source: "Critic review (claude-opus-5, max, functional-equivalent-read-only lane) of GF-074/GF-075 (commits f2a4ac70..42d16e5c), 2026-08-09. Finding F-1, verdict FAIL. The GF-074/GF-075 code fixes themselves (guard-lifecycle-ready kickoff --language allowlist, and F1/F2/F5/F6 on the document-language feature) were cleared as correct; only the F7 test-delivery vehicle is the defect."
due: 2026-08-16
closed_at: 2026-08-09
closure_repository: self
closure_commit: c0d23d90e4ab79d6dd1fcd081adbd81bc45aa5d4
closure_evidence: backlog/evidence/2026-08-09-pipeline-state-f7-test-relocation-closure.md
---

# `plugins/pipeline-core/scripts/pipeline-state.test.mjs` is never executed by Full Verify

## What happened

GF-075 was asked to add regression coverage for `validCurrentDecisionDocuments`'s
`documentLanguage` fallback (`pipeline-state.mjs:3929`), calling `pipeline-state.mjs`'s
`run(["po-authority-decision-plan"], ...)` CLI entry point. Its briefing said the
canonical test site (`harness/scripts/pipeline-state.test.mjs`, named as this
module's own verification suite in `pipeline-state.mjs:258`) is TP-5 guard-protected
(`templates/prompts/agent-obligations.md:92`) and instructed: find the nearest
already-registered, non-protected test site instead. GF-075 found
`plugins/pipeline-core/scripts/pipeline-state.test.mjs` — a real, pre-existing file
that also imports and calls `pipeline-state.mjs`'s `run()` — and added the new test
there, without checking whether Full Verify actually executes that file.

It does not. `harness/scripts/verify.mjs:386` registers the suite name
`pipeline-state-tests` against `join(scriptDir, "pipeline-state.test.mjs")`, where
`scriptDir` (line 66) resolves to `harness/scripts` — the protected file, not the
one GF-075 edited. A repo-wide check of `verify.mjs`'s suite registry confirms
`plugins/pipeline-core/scripts/pipeline-state.test.mjs` (the exact, unsuffixed
filename) is registered under no suite name at all; every other `pipeline-state-*`
suite (`continuity-result-bootstrap-tests`, `pipeline-state-revocation-tests`,
`pipeline-state-inspection-contract-tests`, etc.) points at a differently-named,
suffixed sibling file instead.

This is broader than GF-075's specific test: the file itself
(`plugins/pipeline-core/scripts/pipeline-state.test.mjs`, header: "Focused coverage
for the push threat-model resolution CB-1a introduced") was ALREADY never executed
by Full Verify before this session touched it — a pre-existing gap, not something
GF-075 created. Running it directly (`node plugins/pipeline-core/scripts/pipeline-state.test.mjs`)
passes cleanly today (confirmed, both before and after the F7 addition), so nothing
is currently red; the defect is that a regression here would go completely
undetected by `node harness/scripts/verify.mjs`, the project's one verify gate.

## Why it matters

QG-07/QG-02 (`guardrails/quality-gates.md`) require that a repro/regression test
stays in the enforced suite, not merely in a file that happens to exist. A test
that only runs when a human remembers to invoke it directly provides no CI
guarantee at all — indistinguishable, in practice, from no test. The 267-suite
green Full Verify evidence this session's candidates cite carries zero signal
about either the pre-existing CB-1a coverage or GF-075's new F7 addition.

## Why this is not a same-session fix

The two files that would need to change to close this properly are BOTH hard
guard-protected against Edit/Write from an ordinary Goldfish or Elephant session:

- `harness/scripts/pipeline-state.test.mjs` — TP-5 (`templates/prompts/agent-obligations.md:92`).
- `harness/scripts/verify.mjs` itself — TP-3 (same table, line 90) — needed if the
  fix is instead to register `plugins/pipeline-core/scripts/pipeline-state.test.mjs`
  (or a new, properly-scoped sibling file) as its own suite.

Per `agent-obligations.md:83-84`: "Needing one of these is a stop condition —
report it, do not hunt for a route." No human-override route helps either
(`agent-obligations.md:78-82`: the author-repair branch requires an explicit
author source root a guard will not select on a human's behalf). Closing this
requires either a deliberate, human-authorized maintenance-window transaction
(`guard-maintenance-window.mjs`, already used twice this session for the SETUP-1
authority-narrowing class) scoped to TP-3 and/or TP-5, or a PO-level decision to
carry out the edit outside ordinary dispatch discipline.

## Direction

- Decide the target shape first (Elephant/PO, not an implementor): either (a)
  register `plugins/pipeline-core/scripts/pipeline-state.test.mjs` as a new
  `verify.mjs` suite (requires auditing whether its existing CB-1a-scoped content
  is safe to newly gate the whole candidate on — it passes today, but has never
  been a release gate before), or (b) move GF-075's F7 test specifically into
  `harness/scripts/pipeline-state.test.mjs` proper, leaving the CB-1a file's
  existing scope/registration question separate and still open.
- Whichever shape is chosen, open a `guard-maintenance-window.mjs prepare` request
  scoped to exactly the one guard rule needed (TP-3 or TP-5, not both unless both
  are genuinely required), get it signed, then dispatch the actual edit.
- Until this closes, `plugins/pipeline-core/scripts/pipeline-state.test.mjs:328`
  (the F7 test GF-075 added) carries an inline comment stating plainly that it is
  not part of Full Verify's enforced suite set and pointing at this item — added
  directly as a documentation-only correction (GF-076), not a fix to the
  underlying gap.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:** Accepted, fixed, closed — direction (b) only. Direction (a)
  (register the whole CB-1a file as its own `verify.mjs` suite, needing TP-3)
  was raised with the PO and explicitly declined for this session; it remains
  a separate, independent decision the PO may revisit later, not reopened by
  this closure.
- **Rationale:** (b) closes the concrete regression-coverage gap with a
  single-guard-rule (TP-5) maintenance-window transaction, without newly
  gating the whole candidate on the CB-1a file's pre-existing,
  never-audited-as-a-release-gate content.
- **Assignment:** GF-077 (goldfish-deep), self-verified by the Elephant (diff
  read, both suites and Full Verify re-run independently) — no third Critic
  dispatch, per the standing two-round cap already exercised on this lineage.
- **Date:** 2026-08-09
