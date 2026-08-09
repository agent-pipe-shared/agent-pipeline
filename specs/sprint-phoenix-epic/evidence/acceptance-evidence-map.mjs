#!/usr/bin/env node
// Generator for specs/sprint-phoenix-epic/evidence/acceptance-evidence-map-<date>.md:
// criterion verdicts x live issue acceptance bullets.
//
// Run:  node specs/sprint-phoenix-epic/evidence/acceptance-evidence-map.mjs \
//         --out specs/sprint-phoenix-epic/evidence/acceptance-evidence-map-<date>.md
//
// It lives next to its output rather than under evidence/ because evidence/ is
// git-ignored run output (QG-03) and this map is a durable package artifact.
//
// Inputs are two hand-transcribed maps, each with a cited source:
//   VERDICTS  - the 157 criterion verdicts. Baseline: evidence/phx-epic-coverage.md
//               (task PHX-COVERAGE, 2026-08-08), corrected by evidence/phx-adjudication.md
//               (task PHX-ADJ2, ten not-adjudicable rows resolved), then by the
//               2026-08-09 delta re-measurement in evidence/phx-fin-a.md / phx-fin-b.md.
//   BULLETS   - the 105 live issue acceptance bullets and the criteria each one is
//               proven by, transcribed from specs/sprint-phoenix-epic/design/issue-coverage.md.
//
// Output: for every issue, which live acceptance bullets are blocked and by which
// criteria, under the closure rule at design/issue-coverage.md:201-204 -- an issue
// remains open if any mapped criterion is unimplemented or unverified.
//
// Read-only. Writes one markdown report to stdout.

const IMPLEMENTED = 'implemented';

// --- criterion verdicts -----------------------------------------------------
// value: [verdict, sourceTag]  sourceTag: C = phx-epic-coverage.md, J = phx-adjudication.md,
// A = phx-fin-a.md (2026-08-09 delta), B = phx-fin-b.md (2026-08-09 delta)
const VERDICTS = {
  'PX0-AC-01': ['partial', 'C'],
  'PX0-AC-02': ['partial', 'C'],
  'PX0-AC-03': ['designed-only', 'C'],
  'PX0-AC-04': ['partial', 'C'],
  'PX0-AC-05': ['designed-only', 'C'],
  'PX0-AC-06': ['designed-only', 'C'],
  'PX0-AC-07': ['designed-only', 'C'],
  'PX0-AC-08': ['partial', 'C'],
  'PX0-AC-09': ['partial', 'C'],
  'PX0-AC-10': ['partial', 'C'],
  'PX0-AC-11': ['partial', 'C'],
  'PX0-AC-12': ['implemented', 'C'],
  'PX0-AC-13': ['partial', 'J'],
  'PX0-AC-14': ['implemented', 'C'],
  'PX0-AC-15': ['implemented', 'C'],
  'PX0-AC-16': ['partial', 'C'],
  'PX0-AC-17': ['partial', 'C'],

  'K-AC-01': ['implemented', 'C'],
  'K-AC-02': ['implemented', 'C'],
  'K-AC-03': ['implemented', 'C'],
  'K-AC-04': ['implemented', 'C'],
  'K-AC-05': ['partial', 'C'],
  'K-AC-06': ['implemented', 'C'],
  'K-AC-07': ['implemented', 'C'],
  'K-AC-08': ['partial', 'C'],
  'K-AC-09': ['implemented', 'C'],
  'K-AC-10': ['partial', 'C'],

  'H-AC-01': ['implemented', 'C'],
  'H-AC-02': ['implemented', 'C'],
  'H-AC-03': ['implemented', 'C'],
  'H-AC-04': ['implemented', 'C'],
  'H-AC-05': ['implemented', 'C'],
  'H-AC-06': ['implemented', 'C'],
  'H-AC-07': ['implemented', 'C'],
  'H-AC-08': ['not-started', 'J'],
  'H-AC-09': ['not-started', 'J'],
  'H-AC-10': ['implemented', 'C'],
  'H-AC-11': ['partial', 'C'],
  'H-AC-12': ['partial', 'C'],
  'H-AC-13': ['implemented', 'C'],
  'H-AC-14': ['partial', 'C'],
  'H-AC-15': ['partial', 'C'],

  'A-AC-01': ['partial', 'C'],
  'A-AC-02': ['partial', 'C'],
  'A-AC-03': ['not-started', 'C'],
  'A-AC-04': ['partial', 'C'],
  'A-AC-05': ['not-started', 'J'],
  'A-AC-06': ['implemented', 'C'],
  'A-AC-07': ['partial', 'C'],
  'A-AC-08': ['not-started', 'C'],
  'A-AC-09': ['designed-only', 'J'],
  'A-AC-10': ['partial', 'C'],
  'A-AC-11': ['not-started', 'C'],
  'A-AC-12': ['partial', 'C'],
  'A-AC-13': ['partial', 'C'],
  'A-AC-14': ['partial', 'C'],
  'A-AC-15': ['partial', 'C'],
  'A-AC-16': ['implemented', 'C'],

  'L-AC-01': ['partial', 'C'],
  'L-AC-02': ['partial', 'J'],
  'L-AC-03': ['implemented', 'C'],
  'L-AC-04': ['partial', 'C'],
  'L-AC-05': ['implemented', 'C'],
  'L-AC-06': ['implemented', 'C'],
  'L-AC-07': ['partial', 'C'],
  'L-AC-08': ['partial', 'J'],

  'P-AC-01': ['partial', 'C'],
  'P-AC-02': ['implemented', 'C'],
  'P-AC-03': ['partial', 'C'],
  'P-AC-04': ['implemented', 'C'],
  'P-AC-05': ['implemented', 'C'],
  'P-AC-06': ['partial', 'C'],
  'P-AC-07': ['implemented', 'C'],
  'P-AC-08': ['partial', 'C'],
  'P-AC-09': ['not-started', 'C'],
  'P-AC-10': ['partial', 'C'],
  'P-AC-11': ['partial', 'C'],
  'P-AC-12': ['implemented', 'C'],
  'P-AC-13': ['partial', 'C'],

  'V-AC-01': ['implemented', 'C'],
  'V-AC-02': ['partial', 'C'],
  'V-AC-03': ['implemented', 'C'],
  'V-AC-04': ['implemented', 'C'],
  'V-AC-05': ['implemented', 'C'],
  'V-AC-06': ['partial', 'C'],
  'V-AC-07': ['partial', 'C'],
  'V-AC-08': ['implemented', 'C'],
  'V-AC-09': ['partial', 'C'],
  'V-AC-10': ['implemented', 'C'],

  'X-AC-01': ['implemented', 'C'],
  'X-AC-02': ['implemented', 'C'],
  'X-AC-03': ['implemented', 'C'],
  'X-AC-04': ['implemented', 'C'],
  'X-AC-05': ['implemented', 'C'],
  'X-AC-06': ['implemented', 'C'],
  'X-AC-07': ['implemented', 'C'],
  'X-AC-08': ['implemented', 'C'],
  'X-AC-09': ['implemented', 'C'],
  'X-AC-10': ['implemented', 'C'],
  'X-AC-11': ['not-started', 'J'],
  'X-AC-12': ['partial', 'C'],
  'X-AC-13': ['implemented', 'C'],
  'X-AC-14': ['partial', 'C'],
  'X-AC-15': ['partial', 'C'],

  'C-AC-01': ['implemented', 'C'],
  'C-AC-02': ['partial', 'C'],
  'C-AC-03': ['implemented', 'C'],
  'C-AC-04': ['implemented', 'C'],
  'C-AC-05': ['implemented', 'C'],
  'C-AC-06': ['implemented', 'C'],
  'C-AC-07': ['partial', 'C'],
  'C-AC-08': ['implemented', 'C'],
  'C-AC-09': ['partial', 'C'],
  'C-AC-10': ['implemented', 'C'],
  'C-AC-11': ['implemented', 'C'],
  'C-AC-12': ['partial', 'C'],
  'C-AC-13': ['partial', 'C'],

  'E-AC-01': ['implemented', 'C'],
  'E-AC-02': ['partial', 'C'],
  'E-AC-03': ['implemented', 'C'],
  'E-AC-04': ['partial', 'C'],
  'E-AC-05': ['implemented', 'C'],
  'E-AC-06': ['partial', 'C'],
  'E-AC-07': ['implemented', 'C'],
  'E-AC-08': ['partial', 'C'],
  'E-AC-09': ['partial', 'C'],
  'E-AC-10': ['not-started', 'C'],
  'E-AC-11': ['partial', 'C'],
  'E-AC-12': ['implemented', 'C'],
  'E-AC-13': ['implemented', 'C'],
  'E-AC-14': ['partial', 'C'],
  'E-AC-15': ['implemented', 'C'],
  'E-AC-16': ['implemented', 'C'],
  'E-AC-17': ['implemented', 'C'],
  'E-AC-18': ['implemented', 'C'],
  'E-AC-19': ['implemented', 'C'],
  'E-AC-20': ['not-started', 'J'],
  'E-AC-21': ['partial', 'C'],

  'R-AC-01': ['implemented', 'C'],
  'R-AC-02': ['partial', 'C'],
  'R-AC-03': ['implemented', 'C'],
  'R-AC-04': ['partial', 'C'],
  'R-AC-05': ['implemented', 'C'],
  'R-AC-06': ['implemented', 'C'],
  'R-AC-07': ['implemented', 'C'],
  'R-AC-08': ['partial', 'C'],
  'R-AC-09': ['partial', 'C'],
  'R-AC-10': ['partial', 'C'],
  'R-AC-11': ['partial', 'C'],
  'R-AC-12': ['not-started', 'C'],
  'R-AC-13': ['partial', 'C'],

  'EPIC-AC-01': ['partial', 'C'],
  'EPIC-AC-02': ['not-started', 'J'],
  'EPIC-AC-03': ['partial', 'C'],
  'EPIC-AC-04': ['partial', 'C'],
  'EPIC-AC-05': ['constraint', 'C'],
  'EPIC-AC-06': ['implemented', 'C'],
};

// --- 2026-08-09 delta -------------------------------------------------------
// Applied on top of the baseline. Each entry MUST cite the delta artifact that
// establishes it; an entry with no artifact is a defect, not a promotion.
const DELTA = {
  // --- evidence/phx-fin-a.md (task PHX-FIN-A, 2026-08-09) ---
  // promoted: the continuity-authority-revision writer landed (c62a3c4) and its
  // 102 staged cases were registered into the canonical suite (0f3b4c9).
  'PX0-AC-02': ['implemented', 'A'],
  'PX0-AC-03': ['partial', 'A'],
  'PX0-AC-05': ['partial', 'A'],
  'PX0-AC-06': ['partial', 'A'],
  'PX0-AC-07': ['partial', 'A'],
  // promoted: the red, unregistered codex-host-plugin-list suite was retired
  // (14cca32) and replaced by the registered bootstrap-source-attestation
  // acceptance suite (f32e21c), harness/scripts/verify.mjs:333.
  'PX0-AC-09': ['implemented', 'A'],
  'PX0-AC-10': ['implemented', 'A'],
  'PX0-AC-11': ['implemented', 'A'],
  'PX0-AC-16': ['implemented', 'A'],
  'PX0-AC-17': ['implemented', 'A'],
  // confirmed partial: PX0-AC-01, PX0-AC-04, P-AC-08. P-AC-08's command family
  // and draft bootstrap preview are now built and tested (a5e5b65, b7a6e98),
  // but the existing-manifest reconciliation and the Result-reconciliation
  // fence remain entirely absent.

  // --- evidence/phx-fin-b.md (task PHX-FIN-B, 2026-08-09) ---
  // promoted: 5d0fc6a added `assumptionState` with exactly the seven epistemic
  // states the criterion names, governance/schemas/agent-decision-event.schema.json:14.
  'A-AC-11': ['implemented', 'B'],
  // confirmed: A-AC-01, A-AC-02, A-AC-05, A-AC-07, A-AC-14, H-AC-12,
  // EPIC-AC-01, EPIC-AC-03, EPIC-AC-04.

  // --- evidence/phx-wp-p.txt (task PHX-WP-P, 2026-08-09, commit 8df045f) ---
  // Break-proofed named assertions added to already-registered suites (no
  // registry edit). P-AC-01/P-AC-03 explicitly reported `absent`, not gamed:
  // their named sub-clauses have no corresponding field anywhere in the pack
  // or activation-plan schema, and the dispatch wrote no test around the gap.
  'P-AC-06': ['partial', 'WP-P'],
  'P-AC-10': ['implemented', 'WP-P'],
  'P-AC-11': ['partial', 'WP-P'],

  // --- evidence/phx-wp-k.txt (task PHX-WP-K, 2026-08-09, commit d536fcd) ---
  // Independently re-run: 13/13 governance-event-store-tests pass, both new
  // K-AC assertions present by name. K-AC-10 reclassified `not-started`
  // (from `partial`): the dispatch confirmed by repo-wide search that no
  // multi-stream query carrier exists anywhere, not merely that the clause
  // is unpinned -- the same bar applied to X-AC-11/E-AC-20/H-AC-08/H-AC-09.
  'K-AC-08': ['implemented', 'WP-K'],
  'K-AC-10': ['not-started', 'WP-K'],

  // --- evidence/phx-wp-v.txt (task PHX-WP-V, 2026-08-09, commit fdb0292) ---
  // Independently re-run: 17/17 evidence-view-model/renderer/viewer suites
  // pass, all four V-AC assertions present by name.
  'V-AC-07': ['implemented', 'WP-V'],
  'V-AC-09': ['implemented', 'WP-V'],

  // --- evidence/phx-wp-x.txt (task PHX-WP-X, 2026-08-09, commit 3161a8e) ---
  // Independently re-run: 13/13 external-reference-adapter-tests pass.
  'X-AC-12': ['implemented', 'WP-X'],

  // --- evidence/phx-wp-l.txt (task PHX-WP-L, 2026-08-09, commit 0b53f89) ---
  // Independently re-run: 4/4 governance-replay-core-tests pass.
  'L-AC-07': ['implemented', 'WP-L'],

  // --- evidence/phx-wp-gate.txt (task PHX-WP-GATE, 2026-08-09, commit 92b21ed) ---
  // The third feature-package plan kind, `reconcile`, landed: the digest-only
  // no-drift invariant, PO-bound apply, manual-replacement refusal, and the
  // three-arm Result-reconciliation fence (unbound / metadata-only /
  // fence-mismatch) are all built and proven by 26 staged cases (re-run
  // independently by the Elephant: 26/26 pass). The protected suite
  // (harness/scripts/pipeline-state.test.mjs, TP-5) is unmodified and was
  // re-run independently: 418/418, no regression. The command family
  // itself remains PARTIAL, not implemented: the 26 cases are staged in
  // evidence/, not registered in the gate, because registering them needs
  // the signed TP-3+TP-5 maintenance window this task was explicitly
  // forbidden to open.
  'P-AC-08': ['partial', 'WP-GATE'],

  // --- evidence/phx-wp-c.txt (task PHX-WP-C, 2026-08-09, commit 2a25520) ---
  // Independently re-run: 10/10 change-control-core-tests pass, all three new
  // C-AC assertions present by name, each break-proofed (RED/GREEN pair).
  // All four residual gaps are capability-level (no anti-class-shopping
  // check or standard/normal field distinction; no changeClass-gated
  // retrospective-evidence field in the journal; no advisory-mode-specific
  // reason code; no resolver over multiple candidate profiles anywhere in
  // the module or CLI) -- reclassified Class A to Class B, the same
  // absent-not-merely-unpinned bar applied to L-AC-04/X-AC-14/K-AC-10.
  'C-AC-02': ['partial', 'WP-C'],
  'C-AC-07': ['partial', 'WP-C'],
  'C-AC-09': ['not-started', 'WP-C'],
  'C-AC-12': ['partial', 'WP-C'],

  // --- evidence/phx-wp-a.txt (task PHX-WP-A, 2026-08-09, commit 055cb8b) ---
  // Independently re-run: 12/12 agent-decision-journal-tests pass, all three
  // new A-AC assertions present by name. A-AC-02 fully pinned: all five
  // lifecycle transitions accept a linked follow-up event, one exercised
  // end-to-end through the real store with the original proven unchanged.
  // A-AC-07 reclassified `not-started` (from `partial`) and Class A to Class
  // B: repo-wide search found no per-event-class mandatory-capture concept
  // anywhere in the journal, the shared store, or capture-policy.json --
  // five of the seven named event classes are not even representable as a
  // journal `kind`, the same absent-not-merely-unpinned bar applied to
  // C-AC-09/K-AC-10. A-AC-12/A-AC-13/A-AC-14 stay `partial`/Class A: their
  // residual gaps are named test coverage, not confirmed capability absence
  // (A-AC-14's "decomposition" scenario is the one exception -- it needs a
  // new `kind` enum value, not just a test).
  'A-AC-02': ['implemented', 'WP-A'],
  'A-AC-07': ['not-started', 'WP-A'],

  // --- evidence/phx-wp-r.txt (task PHX-WP-R, 2026-08-09, commit 500d5cc) ---
  // Independently re-run: 16/16 external-command-offer-tests pass, all 11 new
  // assertions present by name. R-AC-02 reclassified `not-started` (from
  // `partial`) and Class A to Class B: recovery-proposed/recovered states
  // exist in the schema but are unreachable via any exported function -- no
  // correlation capability exists at all. R-AC-04/08/09/11/13 stay `partial`
  // but all reclassify Class A to Class B: every residual is a named,
  // structurally-confirmed capability gap, not missing test coverage -- no
  // distinct cleanup/readback field (R-AC-04), no rollback/cleanup
  // COMMAND_STATES entries at all (R-AC-08), no timestamp/supersession field
  // for staleness or duplicate detection (R-AC-09), the module stores
  // nothing by design and "commitment" only exists in an unrelated module
  // (R-AC-11), and two of eleven R-AC-13 fixture states (approval-without-
  // run, duplicate/retry) are structurally unreachable, now demonstrated by
  // a dedicated test rather than merely missing.
  'R-AC-02': ['not-started', 'WP-R'],
  'R-AC-04': ['partial', 'WP-R'],
  'R-AC-08': ['partial', 'WP-R'],
  'R-AC-09': ['partial', 'WP-R'],
  'R-AC-11': ['partial', 'WP-R'],
  'R-AC-13': ['partial', 'WP-R'],

  // --- evidence/phx-pac08-register.txt (Elephant, 2026-08-09, commit 78c6ef1) ---
  // The signed TP-3+TP-5 maintenance window (evidence/phx-p-ac-08-gmw-request.json)
  // was opened, PHX-WP-GATE's 26 staged cases were transplanted into the
  // canonical harness/scripts/pipeline-state.test.mjs suite (purely additive,
  // reusing every existing helper by name), and the window was closed.
  // 444/444 (418 pre-existing + 26 new), node --check clean, diff touches
  // exactly the one file. TP-3 needed no edit: pipeline-state-tests was
  // already registered in verify.mjs.
  //
  // CORRECTED 2026-08-09 after an independent Critic FAIL (F1/F2/F3) --
  // this criterion was wrongly promoted to `implemented`. Reverted to
  // `partial`: no shipped entry point (the CLI's own `run()`, called with
  // no injected deps by both harness/scripts/pipeline-state.mjs and
  // plugins/pipeline-core/scripts/pipeline-state.mjs's isDirectRun guard)
  // ever supplies `deps.featurePackageReconcileApproval` -- only the test
  // file does. The mechanism is real and the 26 cases are honest, but the
  // command is structurally unreachable by any real operator or agent
  // caller, which means the criterion's actual requirement (a working,
  // usable PO-bound reconcile transaction) is not met, only its test
  // double is. Separately, commit 78c6ef1 was authored directly by the
  // Elephant rather than dispatched (Critic F2, EL-01/EL-16) -- a real
  // lifecycle deviation, disclosed and filed as its own backlog item
  // rather than quietly folded into this correction.
  'P-AC-08': ['partial', 'ELEPHANT'],

  // --- evidence/phx-wp-h.txt (task PHX-WP-H, 2026-08-09, commit 2594552) ---
  // Independently re-run: 24/24 human-governance-ledger-tests pass. All
  // thirteen H-AC-15 scenarios pinned: grant/consumption/expiry/redaction
  // were already covered by existing tests; denial/revocation/correction/
  // retry/concurrency/interruption/tampering/stale-candidate/cross-
  // repository-binding are new, each independently break-proofed against a
  // temporary production fault (8 new tests, 6 distinct faults across two
  // modules, zero collateral on the 16 pre-existing tests). No capability
  // gap found -- the criterion is fully implemented, not merely partial.
  'H-AC-15': ['implemented', 'WP-H'],

  // --- evidence/phx-wp-e.txt (task PHX-WP-E, 2026-08-09, commit de13e92) ---
  // Independently re-run: 5/5 adapter, 15/15 delivery, 4/4 outbox (24/24)
  // pass, all five new named assertions present. None of the seven move to
  // implemented -- every criterion is a multi-clause enumeration and each
  // still carries a named gap. Four residuals are CONFIRMED capability
  // absence (code-cited, not merely unpinned), reclassified Class A to
  // Class B: E-AC-02's declare-every-lossy-conversion (mapGovernanceExport-
  // Projection always returns loss:[], governance-export-adapter.mjs:85,98),
  // E-AC-04's policy-allows-and-redacts path (EXPORT_FIELDS is a closed,
  // non-configurable constant, adapter.mjs:15), E-AC-09's "advisory
  // destination" concept (does not exist anywhere in scope), and E-AC-11's
  // per-projection/mapping digest field (only policyRevision exists,
  // governance-event-projection.mjs:22-24). E-AC-08 also reclassifies:
  // 4 of 8 detection classes now pinned (destination-mismatch/forged-ack
  // pre-existing, event-gap/schema-downgrade new); the remaining four
  // (cursor rollback, outbox truncation, source fork, invalid-hash) are
  // structurally absent, confirmed by reading outbox.mjs:6-11 in full.
  // E-AC-06 and E-AC-14 stay Class A, deliberately NOT reclassified: their
  // residuals (an explicit no-exactly-once structural assertion; a
  // dedicated failure-injection fixture) were dropped for tool-budget
  // reasons, not confirmed absent by search -- a materially different,
  // weaker claim than the other five, and the dispatch was explicit about
  // the distinction rather than blurring it.
  'E-AC-02': ['partial', 'WP-E'],
  'E-AC-04': ['partial', 'WP-E'],
  'E-AC-08': ['partial', 'WP-E'],
  'E-AC-09': ['partial', 'WP-E'],
  'E-AC-11': ['partial', 'WP-E'],

  // --- evidence/phx-wp-doc1.txt + phx-wp-doc2.txt (tasks PHX-WP-DOC-1/2,
  // 2026-08-09, commits f9e300c + 3f09bed) ---
  // Both dispatches wrote every named missing section grounded in file:line
  // citations to the code they document, and named known capability gaps
  // inline (export loss-declaration, external-reference-adapter recovery)
  // rather than papering over them. C-AC-13, E-AC-21, P-AC-13, and X-AC-15
  // move to implemented -- independently verified: every section the
  // criterion's clause enumerates by name is now present, additive-only
  // diffs, sanitization clean. A-AC-15 and H-AC-14 stay `partial`: A-AC-15's
  // own briefing (mine) omitted "schema" and "privacy threat model" from
  // its own enumeration of the eight required sections despite quoting the
  // full clause correctly just above -- six of eight landed, two did not
  // because I never asked for them; H-AC-14's four newly-written sections
  // (migration/retention/recovery/operator-guidance) are solid, but its
  // claimed-pre-existing "threat model" coverage turned out to be one
  // scattered sentence in docs/phoenix-governance-threat-model.md:75, not a
  // dedicated section -- not confirmed complete, left honestly partial
  // rather than accepted on the baseline note's word.
  'C-AC-13': ['implemented', 'WP-DOC'],
  'E-AC-21': ['implemented', 'WP-DOC'],
  'P-AC-13': ['implemented', 'WP-DOC'],
  'X-AC-15': ['implemented', 'WP-DOC'],

  // --- evidence/phx-wp-a2.txt (task PHX-WP-A2, 2026-08-09, commit 9f5e680) ---
  // Independently re-run: 20/20 agent-decision-journal-tests, 16/16
  // governance-export-delivery-tests pass. A-AC-12 fully pinned: the
  // portable registry/intent path fails closed for any narrower-than-
  // repository-public-safe stream (GES-REGISTRY/GES-INTENT), and the
  // restricted profile is confirmed owner-authenticated and outside the
  // repository (GES-RESTRICTED-ROOT/IN-REPOSITORY/KEY) -- both residual
  // sub-clauses landed, not just the already-pinned half. A-AC-13 fully
  // pinned: agent-kind fixtures now mirror the generic store's interrupted/
  // concurrent/out-of-order guarantees rather than relying on it by
  // implication. E-AC-06 fully pinned: the receipt's closed enums carry no
  // exactly-once wording and structurally cannot ever admit one. A-AC-14
  // narrows further: 6 of the 7 remaining zero-coverage scenarios now
  // pinned (verification-scope-change/escalation/fallback/redaction/retry/
  // missing-journal-availability); decomposition stays confirmed not
  // representable, tampering stays gapped (needs store-generic digest-
  // recompute verification, correctly left unattempted rather than guessed
  // at). E-AC-14 unchanged: the dispatch re-examined the CAS-conflict and
  // forged-ack tests and judged them genuinely dedicated failure-injection
  // fixtures, not incidental -- no new test needed, verdict/pointer stand.
  // Minor process note: this commit's trailer carries only `AI-Assisted:
  // true`, missing the `Dispatch: PHX-WP-A2 (goldfish)` line every other
  // dispatch this session included -- the dispatch cited a guardrail
  // (GIT-03) blocking provider-correlation trailers, which explains
  // dropping Co-Authored-By but not the separate Dispatch: line; not
  // pursued further, commit content and attribution are otherwise sound.
  'A-AC-12': ['implemented', 'WP-A2'],
  'A-AC-13': ['implemented', 'WP-A2'],
  'E-AC-06': ['implemented', 'WP-A2'],

  // --- evidence/phx-wp-doc3.txt (task PHX-WP-DOC-3, 2026-08-09, commit
  // 7376c2c) --- Independently verified: diffs additive-only across three
  // doc files, sanitization clean, section headers checked directly.
  // A-AC-15's two missing parts (schema, privacy threat model) are now
  // present, grounded in agent-decision-event.schema.json and the R-AC-05
  // test -- all 8 of 8 named parts now present, moves to implemented.
  // H-AC-14's missing "human ledger: threat model" section is now present,
  // eight scenarios each tied to an HGL-* code and, where one exists, an
  // H-AC-15 test -- all 8 of 8 named parts now present, moves to
  // implemented. L-AC-08 gets a new Traceability artifact covering all nine
  // lifecycle-governance-events.mjs kinds; eight are justified, one
  // (`cancellation`) is honestly flagged unclear -- no structural
  // distinction from `status: "cancelled"` exists in the code, so no
  // confident audit-need justification could be constructed. Stays
  // `partial`: the clause requires tracing EACH retained element, and one
  // of nine genuinely isn't traced yet -- an honest gap, not padding.
  'A-AC-15': ['implemented', 'WP-DOC'],
  'H-AC-14': ['implemented', 'WP-DOC'],

  // --- evidence/phx-wp-xac11.txt (task PHX-WP-XAC11, 2026-08-09, commit
  // b78fae1) --- Independently re-run: 19/19 external-reference-adapter-tests
  // pass (13 -> 19, exactly +6 as briefed), node --check clean, only the two
  // declared files touched. planExternalReferenceWrite now consults an
  // injected organizationPolicy whenever pipelineArtifact.documentClass names
  // one of the eight governed classes, failing closed with a distinct reason
  // for no policy supplied, no covering pack entry, a disagreeing mode, or an
  // outstanding approval requirement; an ungoverned (null) reference skips
  // the check and is byte-identical to the pre-dispatch adapter. Break-proofed
  // across 3 cycles (all four reject guards, the approval guard alone, and
  // the null-class skip), each mutation driving exactly the predicted tests
  // red before restoration. The named "approval-required" branch still
  // unconditionally rejects -- no approval-binding mechanism was built, that
  // remains a separate, larger follow-on task per the dispatch's own report.
  'X-AC-11': ['implemented', 'WP-XAC11'],

  // --- evidence/phx-wp-px0.txt (task PHX-WP-PX0, 2026-08-09, commit
  // 00b275e, under the second signed TP-5 maintenance window) --- Independently
  // re-run: 451/451 pipeline-state-tests pass (444 baseline + 7 new), node --check
  // clean, exactly the one declared file changed (40 lines, additive only inside
  // runAuthorityRevisionTests()), break-proof RED confirmed (disabling
  // CS-PROTECTED-AUTHORITY and AR-REVISION-STALE drove exactly AR01a-d/AR03f
  // red, both restored, GREEN reconfirmed). Window closed immediately after
  // independent verification.
  // PX0-AC-01 pinned (AR01a-d): a generic continuity-cas rewriting authority.prd
  // or authority.spec is refused (CS-PROTECTED-AUTHORITY), zero mutation.
  // PX0-AC-04 and PX0-AC-07 were ALREADY fully covered by pre-existing AR04a-i
  // (9 sub-tests) and AR07a-b -- a measurement correction, not new work; no
  // padding test written for either. PX0-AC-03 gains AR03e-g (apply's own
  // fresh State-preimage recheck, not just the next-authority artifact AR03c
  // already covered) but one named axis -- active-feature phase != design ->
  // AR-DECISION-SCOPE -- is reachable in production yet still untested, needing
  // a full plan-approval fixture out of this dispatch's budget; stays partial.
  // PX0-AC-05 and PX0-AC-06 are CONFIRMED ABSENT, not merely unpinned, on the
  // same repo-wide-search bar applied all session to K-AC-10/C-AC-09/A-AC-07:
  // the authority-revision receipt is only ever printed once to apply's stdout
  // or embedded in the private journal, retired on success -- no durable
  // retention exists anywhere (PX0-AC-05); the recover command has exactly
  // three outcome classes (clean, recovered-postimage x2, diverged) and no
  // recovered-preimage success outcome exists anywhere (PX0-AC-06). Both
  // reclassify Class A (assert) to Class B (build).
  'PX0-AC-01': ['implemented', 'WP-PX0'],
  'PX0-AC-03': ['partial', 'WP-PX0'],
  'PX0-AC-04': ['implemented', 'WP-PX0'],
  'PX0-AC-05': ['not-started', 'WP-PX0'],
  'PX0-AC-06': ['not-started', 'WP-PX0'],
  'PX0-AC-07': ['implemented', 'WP-PX0'],
};

// --- per-criterion evidence pointer ----------------------------------------
// One clause per criterion, transcribed from the measurement artifacts named above.
// For `implemented`: the carrier plus the gate-registered suite that pins it.
// For anything else: the exact clause that is NOT pinned or NOT built.
const POINTERS = {
  'PX0-AC-01': 'pipeline-state-tests AR01a-d (PHX-WP-PX0, break-proofed, TP-5 window): a generic continuity-cas rewriting authority.prd or authority.spec is refused (CS-PROTECTED-AUTHORITY), zero mutation, both proved',
  'PX0-AC-02': 'continuity-authority-revision-plan emits the closed request; pinned in pipeline-state.test.mjs (registered)',
  'PX0-AC-03': 'pipeline-state-tests AR03a-g (PHX-WP-PX0): apply rechecks both the next-authority artifact (AR03c) and its own fresh State preimage against a concurrent unrelated mutation (AR03e-g, new). One named axis remains unpinned: active-feature phase != design -> AR-DECISION-SCOPE, reachable in production but needing a full plan-approval fixture the dispatch\'s budget did not cover',
  'PX0-AC-04': 'pipeline-state-tests AR04a-i (PHX-WP-PX0, measurement correction -- already fully covered pre-dispatch): feature/revision/prestate/old-and-next-authority/expiry/candidate/decision-scope/idempotency-reuse all pinned; no new test needed',
  'PX0-AC-05': 'CONFIRMED ABSENT (PHX-WP-PX0, full command-path read): the authority-revision receipt is only ever printed once to apply\'s stdout or embedded in the retired-on-success private journal -- no durable retention exists anywhere',
  'PX0-AC-06': 'CONFIRMED ABSENT (PHX-WP-PX0, full command-path read): recover has exactly three outcome classes (clean, recovered-postimage x2, diverged) -- no recovered-preimage success outcome exists anywhere',
  'PX0-AC-07': 'pipeline-state-tests AR07a-b (PHX-WP-PX0, measurement correction -- already fully covered pre-dispatch): exact zero-write replay (AR07a) and a second/conflicting writer failing closed with State preserved (AR07b) both pinned, reinforced incidentally by the new AR03e-g',
  'PX0-AC-08': 'ruleset-source.mjs closed contract pinned by ruleset-source-tests; whether bootstrap actually EMITS one observation is unpinned',
  'PX0-AC-09': 'bootstrap-source-attestation-acceptance-tests (verify.mjs:333) — Codex-only marketplace resolution',
  'PX0-AC-10': 'bootstrap-source-attestation-acceptance-tests — pre-HEAD consumer compares loaded plugin identity',
  'PX0-AC-11': 'bootstrap-source-attestation-acceptance-tests — one common closed contract across the four source classes',
  'PX0-AC-12': 'ruleset-source-tests: source/loaded/installed/mismatch/remote unavailable each typed distinctly',
  'PX0-AC-13': 'ruleset-freshness-host.mjs selects the host transport correctly, but no suite exercises it and bootstrap does not wire it',
  'PX0-AC-14': 'ruleset-source-tests: private-coordinate-rejected, private-remote-rejected',
  'PX0-AC-15': 'ruleset-source-tests: private-classification-preserved, local-classification-preserved',
  'PX0-AC-16': 'bootstrap-source-attestation-acceptance-tests — equality bound to exact loaded and observed public remote identity',
  'PX0-AC-17': 'bootstrap-source-attestation-acceptance-tests — unknown keys, ambiguous selectors, more than one selected plugin all fail closed',

  'K-AC-01': 'governance-event-core/store-tests: closed envelope, origin payload, physical target, policy, size limits',
  'K-AC-02': 'governance-event-store-tests: exact idempotency is a zero-write replay',
  'K-AC-03': 'same assertion, conflicting-key half',
  'K-AC-04': 'governance-event-store-tests: canonical bytes, readback checkpoint, source-last head, RFC 8785 canonicalization',
  'K-AC-05': 'governance-event-store-tests: fork detection now proven to also block append and recovery, not only verify/query (PHX-WP-K, break-proofed). Still absent: no disposition operation exists anywhere in the module -- "governed disposition appended through the sanctioned recovery operation" has no code to test against',
  'K-AC-06': 'governance-event-store-tests: checkpoint-aware verification; symlink and cross-repository rejection',
  'K-AC-07': 'governance-event-store-tests: projection recovery requires a retained checkpoint',
  'K-AC-08': 'governance-event-store-tests: governance-event-store.mjs:673 (GES-CHECKPOINT) rejects a head/index checkpoint asserting an absent or digest-mismatched canonical record, for both verify and query (PHX-WP-K, break-proofed)',
  'K-AC-09': 'governance-event-core-tests: six exact typed absence states preserved',
  'K-AC-10': 'NO CARRIER, confirmed by repo-wide search (PHX-WP-K): queryPortableGovernanceStream, the governance-event CLI and governance-replay.mjs all accept exactly one streamId; no function anywhere queries more than one stream, so per-record provenance preservation across streams has no code to test',

  'H-AC-01': 'human-governance-ledger-tests: closed portable grant, single-use consumption under the canonical stream lock',
  'H-AC-02': 'governance-authority-resolver-tests + guard-push consumption receipt',
  'H-AC-03': 'human-governance-ledger-tests: one event-specific link and outcome per authority disposition',
  'H-AC-04': 'human-governance-ledger-tests: repository/candidate drift, expiry, consuming disposition all fail closed',
  'H-AC-05': 'human-governance-ledger-tests: detached proof verified without upgrading to human identity; no attribution field admitted',
  'H-AC-06': 'human-governance-ledger-tests: append-only consumption disposition; restricted-store erasure pinned separately',
  'H-AC-07': 'human-governance-ledger-tests: cross-repository decision rejected before mutation',
  'H-AC-08': 'NO CARRIER: no path imports a legacy approval/override/deploy record as an unverified observation',
  'H-AC-09': 'NO CARRIER: external-push-ledger is scoped to single-repo push proofs; nothing binds cross-repository guarded work to one physical target',
  'H-AC-10': 'five named assertions covering scope, reason, expiry, constraints, follow-up review, no standing bypass',
  'H-AC-11': 'portable reconstruction surface pinned; the no-join-handle clause is proved UNSATISFIABLE for the GMW half (acceptance.md amendment, tracked as O-4)',
  'H-AC-12': 'guard-push/guard-devplan/change-control validate the decision reference; the DUAL-EVALUATION during migration with shared owner and expiry has no carrier',
  'H-AC-13': 'human-governance-ledger-tests + store admission: prohibited content rejected before any temporary file exists',
  'H-AC-14': 'docs/governance-events.md (PHX-WP-DOC-1 + PHX-WP-DOC-3): all eight named parts present -- migration/retention/recovery/operator-guidance and schema/taxonomy/authority-trust-model were already solid, and a dedicated "Human ledger: threat model" section now covers eight scenarios each tied to an HGL-* code and, where one exists, an H-AC-15 test',
  'H-AC-15': 'human-governance-ledger-tests (PHX-WP-H): all thirteen named scenarios pinned (grant/consumption/expiry/redaction pre-existing; denial/revocation/correction/retry/concurrency/interruption/tampering/stale-candidate/cross-repository-binding new and break-proofed)',

  'A-AC-01': 'record shape pinned; nothing enforces recording BEFORE dependent action where policy requires',
  'A-AC-02': 'agent-decision-journal-tests (PHX-WP-A): all five lifecycle transitions (verified/contradicted/expired/invalidated/superseded) accept a linked follow-up event, exercised end-to-end through the store with the original proven byte-for-byte unchanged',
  'A-AC-03': 'NO CARRIER: no revalidation/invalidation path identifies objects affected by a changed assumption',
  'A-AC-04': 'CORRECTED 2026-08-09 (Elephant, direct code read): the correlation mechanism EXISTS and is tested -- recordPipelineAttempt (external-command-offer.mjs:29) calls an injected resolveHumanAuthority resolver and fails closed (self-confirmation prevented) whenever authorityRequirement is "human-decision-required". What is actually missing: zero production call sites invoke recordPipelineAttempt anywhere in the codebase (grep confirms only its own definition and test file reference it) -- the interface is built, nothing calls it with the real resolveHumanGovernanceAuthority resolver at the point an agent actually asks for authority. Smaller Class S task than the old pointer text implied ("no correlation path is implemented" was wrong; the path exists and is dead code, not absent)',
  'A-AC-05': 'NO CARRIER: neither event shape carries a runner/model/effort/profile/role/adapter field at all',
  'A-AC-06': 'agent-decision-journal-tests: free text, authority-shaped fields and unbound supersession rejected',
  'A-AC-07': 'CONFIRMED ABSENT (PHX-WP-A, repo-wide search): no per-event-class "mandatory" capture concept exists anywhere in the journal, the shared store, or capture-policy.json -- five of the seven named event classes are not even representable as a journal `kind`',
  'A-AC-08': 'NO CARRIER: no detector for missing dispatch provenance; the Dispatch: trailer is convention only',
  'A-AC-09': 'materiality is documented as design intent only; no code enforces or measures it',
  'A-AC-10': 'the offer path fails closed on unavailable journaling; no per-event-class fail-open/fail-closed policy exists',
  'A-AC-11': 'agent-decision-event.schema.json:14 assumptionState enumerates exactly the seven required epistemic states (landed 5d0fc6a)',
  'A-AC-12': 'agent-decision-journal-tests (PHX-WP-A + PHX-WP-A2): downstream export/projection policy is independently configurable from capture eligibility and structurally cannot weaken it; the portable path fails closed for any narrower-than-repository-public-safe stream, and the restricted profile is confirmed owner-authenticated and outside the repository',
  'A-AC-13': 'agent-decision-journal-tests (PHX-WP-A + PHX-WP-A2): the duplicate-submission clause is pinned, and agent-kind fixtures now mirror the generic store\'s interrupted/concurrent/out-of-order guarantees directly rather than relying on them by implication',
  'A-AC-14': '11 of 13 named conformance scenarios now have dedicated coverage (PHX-WP-A + PHX-WP-A2); "decomposition" is confirmed not representable in the current `kind` enum; "tampering" stays gapped -- needs store-generic digest-recompute verification, correctly left unattempted rather than guessed at',
  'A-AC-15': 'docs/agent-decision-journal.md (PHX-WP-DOC-1 + PHX-WP-DOC-3): all eight named parts present -- taxonomy/materiality/trust/retention/recovery/operator docs, plus Schema (grounded in agent-decision-event.schema.json) and Privacy threat model (grounded in the R-AC-05 test and assertPortablePayload) closing the two the original briefing accidentally omitted',
  'A-AC-16': 'agent-decision-journal-tests: a journal event cannot present as approval',

  'L-AC-01': 'the closed lifecycle schema and validator are pinned; NO PRODUCER exists — no Pipeline path emits a lifecycle event',
  'L-AC-02': 'six of the eight #10 exchange identities are retained; queueRevision and a distinct correlationId are absent',
  'L-AC-03': 'lifecycle-governance-events-tests: registered namespace only, no credential-carrying namespace, no opaque digest',
  'L-AC-04': 'semantic classes pinned; the VISUAL class remains confirmed absent (PHX-WP-L): the renderer has no origin field to key a visual marker off and gives every event kind the same CSS class -- a renderer change, not a missing test',
  'L-AC-05': 'lifecycle-governance-events-tests: candidate invalidation visible, duplicate sequences fail closed',
  'L-AC-06': 'replay rejects extra event data instead of exposing raw lifecycle bodies',
  'L-AC-07': 'governance-replay-core-tests: serial/parallel/retry/cancellation/recovery fixtures replay to identical bounded output on repeat, and a malicious duplicate-sequence fixture is rejected deterministically (PHX-WP-L, break-proofed twice)',
  'L-AC-08': 'docs/governance-replay.md "Traceability" (PHX-WP-DOC-3): 8 of 9 lifecycle-governance-events.mjs kinds traced to a stated user/audit need; the `cancellation` kind is honestly flagged unclear -- no structural distinction from `status: "cancelled"` exists in the code, so no confident justification could be constructed',

  'P-AC-01': 'CONFIRMED ABSENT (PHX-WP-P): schema/compatibility/merge pinned; provenance, dependency and signature-policy validation have no corresponding field anywhere in the pack schema, no test was written around the gap',
  'P-AC-02': 'organization-policy-tests: floor weakening, unknown rule, single-owner conflict all rejected',
  'P-AC-03': 'CONFIRMED ABSENT (PHX-WP-P): planOrganizationPolicyActivation pinned; newly-required artifacts, external effects and backfill range have no corresponding field anywhere in the activation-plan schema, no test was written around the gap',
  'P-AC-04': 'organization-policy-activation-tests: activation only after a bound authority readback; stale plan preimage rejected',
  'P-AC-05': 'organization-policy-tests: credential, endpoint, coordinate, actor-mapping and signing-key fields refused at every level',
  'P-AC-06': 'audit-bundle-core-tests: missing, misplaced, illegally-mutable, stale and truncated each pinned (PHX-WP-P, break-proofed). legacy and orphaned remain unpinned: the legacy classification exists (feature-package-topology.mjs:78) but no rejection path consults it, and no code checks a package file is referenced by an artifact',
  'P-AC-07': 'audit-bundle-tests: signs and verifies only an unchanged manifest, without identity or authority claims',
  'P-AC-08': 'CORRECTED 2026-08-09 (independent Critic FAIL, F3): the reconcile transaction is built and gate-registered (444/444, harness/scripts/pipeline-state.test.mjs), but no shipped entry point ever supplies deps.featurePackageReconcileApproval -- pipeline-state.mjs:5644 has no default (`??`) fallback, unlike its sibling deps, and both CLI entry points call run() with none. Only the test file ever provides the resolver. The command as shipped cannot be invoked by any real operator or agent -- structurally identical to the "interface built, no caller" gap this session found and disclosed for A-AC-04, just not caught here until independent review',
  'P-AC-09': 'NO CARRIER: no export-backfill preview or explicit consent path exists',
  'P-AC-10': 'organization-policy-core-tests + audit-bundle-core-tests: pack-side compliance-claim rejection and signed-bundle no-identity-claim shape both pinned (PHX-WP-P, break-proofed). Log/viewer halves were out of the dispatched carrier scope and remain unevaluated either way',
  'P-AC-11': 'organization-policy-core-tests: mode (closed reference-only/projection/controlled-publication set) and approval (union, no downgrade) pinned (PHX-WP-P, break-proofed). Target class/binding, owned fields/sections, lifecycle event, preview, retention and revision readback remain unpinned: documentClasses is closed to exactly class/mode/approvalRequired, no field exists for the rest',
  'P-AC-12': 'audit-bundle-tests: tampered or missing bundle bytes detected; signature invalidated when the manifest changes',
  'P-AC-13': 'docs/organization-policy-packs.md + docs/audit-bundles.md (PHX-WP-DOC-2): threat model, pack/schema/activation policy, bundle policy, and compatibility/migration/versioning policy all present and grounded -- the compatibility section honestly states no pack-schema migration mechanism exists (only v1 is accepted; revision is a content digest, not a version number)',

  'V-AC-01': 'evidence-view-model-tests: offline report with source links and a candidate-bound receipt',
  'V-AC-02': 'evidence-view-renderer-tests: fact, unknown, unavailable, redacted, invalid and not-applicable each labelled visibly, six of nine (PHX-WP-V, break-proofed). estimate, assumption and human decision remain unpinned: zero occurrences anywhere in the view-model, renderer or CLI modules -- no field carries them at all',
  'V-AC-03': 'evidence-view-model-tests: claims linked to canonical source record and exact candidate',
  'V-AC-04': 'evidence-view-model-tests: invalid topology yields an invalid view with no candidate or artifact leak',
  'V-AC-05': 'evidence-view-renderer-tests: deterministic redacted projection withholding artifact paths',
  'V-AC-06': 'evidence-view-renderer-tests: exact CSP directive value, skip-link keyboard focus target, and landmark/table accessibility structure all pinned (PHX-WP-V, break-proofed). Mobile/desktop snapshot checks remain absent: a viewport meta tag and one CSS breakpoint exist but no test or tooling captures a deterministic snapshot of either, and this repo has no headless-render/visual-regression infrastructure at all',
  'V-AC-07': 'evidence-viewer-tests: input-side rejection was already pinned; a new assertion tampers the generated viewer file and proves canonical authority stays unchanged and re-derivation never yields a pass claim (PHX-WP-V, break-proofed)',
  'V-AC-08': 'evidence-view-model-tests: exact canonical lifecycle state or a typed unavailable result',
  'V-AC-09': 'evidence-view-renderer-tests: all seven required fixtures now covered -- pass/fail/unknown pre-existing, tampered/misplaced/orphaned/legacy-layout added with deterministic snapshots (PHX-WP-V, break-proofed)',
  'V-AC-10': 'evidence-viewer-tests: candidate binding rendered before any derived summary',

  'X-AC-01': 'external-reference-adapter-tests: unclosed references rejected, non-pipeline-owned writes blocked',
  'X-AC-02': 'external-reference-adapter-tests: one ownership class per synchronized field/section',
  'X-AC-03': 'external-reference-adapter-tests: inspect, exact preview, authority, idempotent apply, matching readback',
  'X-AC-04': 'external-reference-adapter-tests: no success reported for revision, capability, authority or readback conflict',
  'X-AC-05': 'external-reference-adapter-tests: external observations reconciled without importing them as authority',
  'X-AC-06': 'external-reference-adapter-tests: deterministic typed state for every abnormal external observation',
  'X-AC-07': 'external-reference-adapter-tests: credentials and private coordinates kept out of every portable record',
  'X-AC-08': 'external-reference-adapter-tests: provider names and fields kept out of the normative core schemas',
  'X-AC-09': 'external-reference-adapter-tests: external content treated as untrusted data, no execution or authority injection',
  'X-AC-10': 'external-reference-adapter-tests: identity resolved through the feature package, not a path guess',
  'X-AC-11': 'external-reference-adapter-tests (PHX-WP-XAC11, break-proofed): planExternalReferenceWrite consults an injected organizationPolicy for a governed documentClass, failing closed on no policy / no covering class / mode mismatch / outstanding approval; approval-binding itself is a named open follow-on, not built here',
  'X-AC-12': 'external-reference-adapter-tests: plan->apply->reconcile proven identical across synthetic issue-tracker, knowledge-base, document-store and secondary-forge profiles, and every cross-profile capability mismatch rejected (PHX-WP-X, break-proofed)',
  'X-AC-13': 'external-reference-adapter-tests: defaults to reference-only or projection, never last-write-wins',
  'X-AC-14': 'confirmed absent (PHX-WP-X): neither inspect() call site (external-reference-adapter.mjs:61,72) has a try/catch, so an unreachable external system throws uncaught instead of producing a typed observation -- filed as pipeline.external-reference-adapter-has-no-typed-response-to-an-unreachable-external-system, a production fix not a missing test',
  'X-AC-15': 'docs/external-traceability.md (PHX-WP-DOC-2): threat model, ownership/lifecycle mapping, publication guide, recovery procedure, and conformance suite added and grounded; the recovery procedure names the adapter\'s uncaught-inspect()-rejection gap and its backlog item explicitly rather than describing a graceful path that does not exist',

  'C-AC-01': 'change-control-tests: profile validation plus the exact bound tuple for mandatory promotion',
  'C-AC-02': 'change-control-tests (PHX-WP-C, break-proofed): "standard" is pinned as a distinct changeClass paired with mandatory authority, alongside emergency and not-required; the required-field-level distinction between standard and normal, and any anti-class-shopping check, remain absent -- validateChangeControlProfile requires the identical fixed key set for every class',
  'C-AC-03': 'change-control-tests: Pipeline and external authority validated independently against the same tuple',
  'C-AC-04': 'change-control-tests: stale, unauthenticated, mismatched, unavailable and outside-window state all block',
  'C-AC-05': 'change-control-tests: external update published only after the local deployment event; failed attempts preserved',
  'C-AC-06': 'change-control-tests: reconciliation-required entered instead of claiming completed change control',
  'C-AC-07': 'change-control-tests (PHX-WP-C, break-proofed): explicit emergency authority and bounded-scope rejection of a scope mismatch are pinned; retrospective evidence proving the emergency was real or reviewed is not -- the journal binding does not even carry changeClass, so nothing is gated on it',
  'C-AC-08': 'change-control-tests: the deploy adapter stays independently usable when not-required',
  'C-AC-09': 'CONFIRMED ABSENT (PHX-WP-C, repo-wide search): no resolver over multiple candidate change-control profiles exists anywhere in this module or its CLI -- there is no data shape representing "release configuration for an environment" as a set of candidates, so nothing exists to test',
  'C-AC-10': 'change-control-tests: an automatically created external record stays draft or observation',
  'C-AC-11': 'change-control-tests: provider names and fields kept out of the provider-neutral core schema',
  'C-AC-12': 'change-control-tests (PHX-WP-C, break-proofed): unavailable external state blocks via C-AC-04, and the distinct "external-unavailable" gate reason is now pinned by name; the explicit advisory-vs-mandatory policy distinction remains absent -- mandatory:false is only representable together with changeClass:"not-required", which short-circuits before ITSM availability is ever inspected',
  'C-AC-13': 'docs/change-control.md (PHX-WP-DOC-1): threat model, policy precedence, migration, operator runbook, and failure/rollback/recovery procedures all present and grounded in change-control.mjs; migration section honestly states no migration tooling exists',

  'E-AC-01': 'governance-export-adapter-tests: one validated source mapped deterministically with stable identity',
  'E-AC-02': 'CONFIRMED ABSENT (PHX-WP-E): deterministic mapping is pinned (pre-existing); mapGovernanceExportProjection always returns loss:freeze([]) even though rfc5424() drops eventId/correlation/candidate/repositoryFingerprint/eventDigest/policyDigest -- governance-export-adapter.mjs:85,98, no lossy conversion is ever declared',
  'E-AC-03': 'governance-export-adapter-tests: policy-less exports denied, only explicitly allowed fields projected',
  'E-AC-04': 'governance-export-adapter-tests (PHX-WP-E, break-proofed): default omission of rationale/summary is pinned; CONFIRMED ABSENT: the "policy allows and redacts" path -- EXPORT_FIELDS is a closed, non-configurable constant (adapter.mjs:15), no policy can ever admit the field',
  'E-AC-05': 'governance-export-outbox-tests: independent destination queues, idempotent enqueue, retryable and quarantined entries preserved',
  'E-AC-06': 'governance-export-delivery-tests (PHX-WP-E + PHX-WP-A2): stable idempotency and at-least-once redelivery are pinned; the receipt\'s closed enums carry no exactly-once wording and structurally cannot ever admit one -- the SHALL-NOT-claim-exactly-once negative is now pinned directly',
  'E-AC-07': 'governance-export-delivery-tests: only the safely acknowledged prefix advances after partial delivery',
  'E-AC-08': 'governance-export-outbox-tests (PHX-WP-E, break-proofed): 4 of 8 detections pinned (destination-mismatch/forged-ack pre-existing, event-gap/schema-downgrade new); CONFIRMED ABSENT: cursor rollback, outbox truncation, source fork, invalid hash -- no bound on cursor vs entries.length or hash-chain check anywhere in outbox.mjs:6-11',
  'E-AC-09': 'governance-export-delivery-tests (PHX-WP-E, break-proofed): lag exposed on a failed acknowledgement is pinned; CONFIRMED ABSENT: the "advisory destination" concept itself -- no such distinction exists anywhere in scope, so "canonical governance continues under an unavailable advisory destination" is not representable',
  'E-AC-10': 'NO CARRIER: no named lifecycle boundary blocks only the exact unacknowledged source range',
  'E-AC-11': 'governance-export-delivery-tests (PHX-WP-E, break-proofed): the closed 9-field receipt schema is pinned, rejecting any retention/immutability/analyst-review/compliance-implying extension; CONFIRMED ABSENT: a per-projection/mapping digest field -- only policyRevision exists (governance-event-projection.mjs:22-24)',
  'E-AC-12': 'governance-export-adapter-tests: profile and acknowledgements are closed, non-authoritative and deduplicated',
  'E-AC-13': 'governance-export-outbox-tests: destination queues, cursors and failure domains stay independent',
  'E-AC-14': 'in-memory, local-file, OTLP-profile and syslog fixtures are each individually cited (PHX-WP-E); dedicated failure-injection coverage was judged sufficient by indirect citation (CAS-conflict, forged-ack tests) rather than confirmed absent by search -- no new test added, budget-limited not capability-limited',
  'E-AC-15': 'governance-export-adapter-tests: allowlisting/redaction completed before every persistence boundary',
  'E-AC-16': 'nine named assertions: batching bound, compression, payload bound, rate limit, retry budget, backpressure, flush, restart resume, replay',
  'E-AC-17': 'governance-export-outbox-tests: duplicate delivery preserves one canonical source history',
  'E-AC-18': 'governance-export-adapter-tests: destination secrets excluded from every portable export record',
  'E-AC-19': 'evidence-viewer-tests: export lag and receipts rendered as a separate non-authoritative observation',
  'E-AC-20': 'NO CARRIER: audit-bundle carries nothing from the export package, and the export modules never reference the bundle',
  'E-AC-21': 'docs/governance-event-export.md (PHX-WP-DOC-2): threat model, data-flow diagram, mapping/loss guide, retention guidance, operator runbook, and incident/recovery procedures all present and grounded; the loss guide names the known loss:[] gap explicitly, the retention section reports no pruning/archival/expiry function exists anywhere in the outbox modules',

  'R-AC-01': 'external-command-offer-tests: public-safe offer recorded before presentation, verified append readback required',
  'R-AC-02': 'CONFIRMED ABSENT (PHX-WP-R): recovery-proposed/recovered states exist in the schema but are unreachable through any exported function -- no capability correlates a rejected path, alternatives, or selected recovery to the offer',
  'R-AC-03': 'external-command-offer-tests: a bound human decision is required for destructive attempts and appended before execution',
  'R-AC-04': 'external-command-offer-tests (PHX-WP-R): operation class, target, exact pre/post digests, and recoverability are bound and validated together; a distinct "required cleanup/readback" field beyond the recoverability enum does not exist',
  'R-AC-05': 'agent-decision-journal-tests: every enumerated private field and every untyped digest refused at both journal boundaries',
  'R-AC-06': 'external-command-offer-tests: user execution stays unobserved; completion admitted only with bounded evidence',
  'R-AC-07': 'external-command-offer-tests: failed, partial, cancelled, mismatch and unknown outcomes retained distinctly',
  'R-AC-08': 'external-command-offer-tests (PHX-WP-R): a readback lifecycle event appends exactly once and never rewrites the original offer; rollback/cleanup as *occurred* events are absent -- no such state exists at all, only prospective values inside recoverability',
  'R-AC-09': 'external-command-offer-tests (PHX-WP-R): missing offer link, contradictory outcome evidence, and cross-repository/cross-scope substitution all fail closed (never successful); stale and duplicate detection remain absent -- no timestamp field, no supersession semantics for command-offer events',
  'R-AC-10': 'fail-closed on the append is pinned; the policy-defined typed non-material exception is absent',
  'R-AC-11': 'external-command-offer-tests (PHX-WP-R): a mandatory public-safe typed omission is pinned; "sanctioned machine-local state" storage and a distinct "commitment" field are absent from this module (it stores nothing by design; commitment only exists in the unrelated document-lifecycle.mjs)',
  'R-AC-12': 'NO CARRIER: no Phoenix bootstrap-trajectory fixture exists',
  'R-AC-13': 'external-command-offer-tests (PHX-WP-R): 9 of 11 required fixture classes now named (7 pre-existing + secret/malicious command rejection + governed-script identity); approval-without-run and duplicate/retry are confirmed structurally unreachable, each pinned by a dedicated test showing the gap rather than left silently missing',

  'EPIC-AC-01': 'the issue-to-criterion mapping exists; no independent closure status exists for any of the eight issues',
  'EPIC-AC-02': 'NO CARRIER: planParallelSprintIntegration has no concept of "unpublished" and is called only from its own test file',
  'EPIC-AC-03': 'an outstanding deviation is recorded (the bound Spec section 7 inventory omits six implemented modules) and is not yet repaired through the sanctioned route',
  'EPIC-AC-04': 'Full Verify and blocking Security pass only on the last PUSHED candidate (`3387065`), not the integrated one measured here (see the gates table below). An independent high-risk Critic on the integrated candidate is no longer absent -- it ran 2026-08-09 and returned FAIL (5 major, 2 minor); privacy review and explicit PO acceptance remain absent',
  'EPIC-AC-05': 'a prohibition, and it currently bites -- see the summary count above for the exact figure; deliberately not hardcoded here after an independent Critic FAIL found this line stale against the generated total more than once (F4, 2026-08-09)',
  'EPIC-AC-06': 'the PRD header records the PO approval binding the first implementation dispatch',
};

// --- closure classification -------------------------------------------------
// For every criterion that is not `implemented`: how it closes, and who owns the
// files it closes in. The class is the design decision; the work package is the
// file-ownership partition that lets packages run in parallel under Spec 4.6.
//
// class:
//   assert - the behaviour exists and is correct; what is missing is a named
//            assertion in an already-registered suite. Closes by test authorship
//            in an unprotected file. No maintenance window, no PO gate.
//   doc    - the gap is a missing documentation section the criterion enumerates.
//   seam   - two packages are each implemented and mutually unaware; closes by
//            building the connector, not by extending either side.
//   build  - an absent capability. Real implementation.
//   po     - not closeable by writing code: a human gate, a recorded deviation
//            needing the sanctioned authority route, or a proved impossibility.
const CLOSURE = {
  'PX0-AC-01': ['assert', 'WP-PX0'],
  'PX0-AC-03': ['assert', 'WP-PX0'],
  'PX0-AC-04': ['assert', 'WP-PX0'],
  'PX0-AC-05': ['build', 'WP-PX0'],
  'PX0-AC-06': ['build', 'WP-PX0'],
  'PX0-AC-07': ['assert', 'WP-PX0'],
  'PX0-AC-08': ['build', 'WP-PX0'],
  'PX0-AC-13': ['build', 'WP-PX0'],

  'K-AC-05': ['build', 'WP-K'],
  'K-AC-08': ['assert', 'WP-K'],
  'K-AC-10': ['build', 'WP-K'],

  'H-AC-08': ['seam', 'WP-H'],
  'H-AC-09': ['seam', 'WP-H'],
  'H-AC-11': ['po', 'WP-PO'],
  'H-AC-12': ['build', 'WP-H'],
  'H-AC-14': ['doc', 'WP-DOC'],
  'H-AC-15': ['assert', 'WP-H'],

  'A-AC-01': ['build', 'WP-A'],
  'A-AC-02': ['assert', 'WP-A'],
  'A-AC-03': ['build', 'WP-A'],
  'A-AC-04': ['seam', 'WP-A'],
  'A-AC-05': ['seam', 'WP-A'],
  'A-AC-07': ['build', 'WP-A'],
  'A-AC-08': ['build', 'WP-A'],
  'A-AC-09': ['build', 'WP-A'],
  'A-AC-10': ['build', 'WP-A'],
  'A-AC-12': ['assert', 'WP-A'],
  'A-AC-13': ['assert', 'WP-A'],
  'A-AC-14': ['assert', 'WP-A'],
  'A-AC-15': ['doc', 'WP-DOC'],

  'L-AC-01': ['build', 'WP-L'],
  'L-AC-02': ['build', 'WP-L'],
  'L-AC-04': ['build', 'WP-L'],
  'L-AC-07': ['assert', 'WP-L'],
  'L-AC-08': ['doc', 'WP-DOC'],

  'P-AC-01': ['build', 'WP-P'],
  'P-AC-03': ['build', 'WP-P'],
  'P-AC-06': ['build', 'WP-P'],
  'P-AC-08': ['build', 'ELEPHANT'],
  'P-AC-09': ['build', 'WP-P'],
  'P-AC-10': ['assert', 'WP-P'],
  'P-AC-11': ['build', 'WP-P'],
  'P-AC-13': ['doc', 'WP-DOC'],

  'V-AC-02': ['build', 'WP-V'],
  'V-AC-06': ['build', 'WP-V'],
  'V-AC-07': ['assert', 'WP-V'],
  'V-AC-09': ['assert', 'WP-V'],

  'X-AC-11': ['seam', 'WP-X'],
  'X-AC-12': ['assert', 'WP-X'],
  'X-AC-14': ['build', 'WP-X'],
  'X-AC-15': ['doc', 'WP-DOC'],

  'C-AC-02': ['build', 'WP-C'],
  'C-AC-07': ['build', 'WP-C'],
  'C-AC-09': ['build', 'WP-C'],
  'C-AC-12': ['build', 'WP-C'],
  'C-AC-13': ['doc', 'WP-DOC'],

  'E-AC-02': ['build', 'WP-E'],
  'E-AC-04': ['build', 'WP-E'],
  'E-AC-06': ['assert', 'WP-E'],
  'E-AC-08': ['build', 'WP-E'],
  'E-AC-09': ['build', 'WP-E'],
  'E-AC-10': ['build', 'WP-E'],
  'E-AC-11': ['build', 'WP-E'],
  'E-AC-14': ['assert', 'WP-E'],
  'E-AC-20': ['seam', 'WP-E'],
  'E-AC-21': ['doc', 'WP-DOC'],

  'R-AC-02': ['build', 'WP-R'],
  'R-AC-04': ['build', 'WP-R'],
  'R-AC-08': ['build', 'WP-R'],
  'R-AC-09': ['build', 'WP-R'],
  'R-AC-10': ['build', 'WP-R'],
  'R-AC-11': ['build', 'WP-R'],
  'R-AC-12': ['build', 'WP-R'],
  'R-AC-13': ['build', 'WP-R'],

  'EPIC-AC-01': ['po', 'WP-PO'],
  'EPIC-AC-02': ['build', 'WP-EPIC'],
  'EPIC-AC-03': ['po', 'WP-PO'],
  'EPIC-AC-04': ['po', 'WP-PO'],
  'EPIC-AC-05': ['po', 'WP-PO'],
};

// Work package -> the files it owns exclusively. Two packages may run in parallel
// only when their file sets are disjoint (Spec 4.6).
const WORK_PACKAGES = {
  'WP-GATE': ['plugins/pipeline-core/lib/feature-package-topology.mjs', 'plugins/pipeline-core/scripts/pipeline-state.mjs', 'harness/scripts/pipeline-state.test.mjs (TP-5)'],
  'WP-K': ['plugins/pipeline-core/lib/governance-event-store.test.mjs', 'plugins/pipeline-core/lib/governance-event.test.mjs'],
  'WP-P': ['plugins/pipeline-core/lib/audit-bundle*.mjs', 'plugins/pipeline-core/lib/organization-policy*.mjs'],
  'WP-V': ['plugins/pipeline-core/lib/evidence-view-model*.mjs', 'plugins/pipeline-core/lib/evidence-view-renderer*.mjs'],
  'WP-X': ['plugins/pipeline-core/lib/external-reference-adapter*.mjs'],
  'WP-C': ['plugins/pipeline-core/lib/change-control*.mjs'],
  'WP-E': ['plugins/pipeline-core/lib/governance-export-*.mjs'],
  'WP-A': ['plugins/pipeline-core/lib/agent-decision-journal*.mjs', 'governance/schemas/agent-decision-event.schema.json'],
  'WP-L': ['plugins/pipeline-core/lib/lifecycle-governance-events*.mjs', 'plugins/pipeline-core/lib/governance-replay*.mjs'],
  'WP-H': ['plugins/pipeline-core/lib/human-governance-ledger*.mjs', 'plugins/pipeline-core/lib/governance-authority-resolver*.mjs', 'plugins/pipeline-core/lib/external-push-ledger*.mjs'],
  'WP-R': ['plugins/pipeline-core/lib/external-command-offer*.mjs'],
  'WP-PX0': ['plugins/pipeline-core/lib/ruleset-source*.mjs', 'plugins/pipeline-core/scripts/ruleset-freshness-host.mjs', 'plugins/pipeline-core/lib/continuity-state.mjs'],
  'WP-EPIC': ['plugins/pipeline-core/lib/parallel-sprint-integration*.mjs'],
  'WP-DOC': ['docs/*.md (one section set per package)'],
  'WP-PO': ['none - human gates and recorded deviations'],
};

// --- live issue acceptance bullets -----------------------------------------
// Transcribed verbatim from specs/sprint-phoenix-epic/design/issue-coverage.md.
const BULLETS = {
  5: {
    title: 'Generate a local human-readable Evidence Viewer',
    rows: [
      ['One command produces offline HTML', ['V-AC-01']],
      ['All canonical lifecycle states are represented', ['V-AC-08']],
      ['Tampered/stale/mismatched/misplaced/orphaned evidence fails visibly', ['V-AC-04', 'V-AC-09', 'K-AC-06']],
      ['Exact candidate binding is prominent', ['V-AC-10']],
      ['Pass/fail/unknown/tampered/misplaced/legacy fixtures', ['V-AC-09']],
      ['Accessibility and mobile/desktop readability', ['V-AC-06']],
    ],
  },
  9: {
    title: 'Introduce organization policy packs and signed audit bundles',
    rows: [
      ['Policy origin and effective value are inspectable', ['P-AC-03']],
      ['Conflicting/incompatible packs cannot activate silently', ['P-AC-01', 'P-AC-02', 'P-AC-04']],
      ['Required documentation stays provider-neutral', ['P-AC-11']],
      ['External permission is scoped by class/target/mode/ownership/event/approval', ['P-AC-11', 'X-AC-02', 'X-AC-03']],
      ['Policy cannot grant unrestricted edits or import prose authority', ['P-AC-02', 'P-AC-11', 'X-AC-05']],
      ['Publications require preview, source digest, revision readback, reconciliation', ['P-AC-11', 'X-AC-03', 'X-AC-04']],
      ['Audit bundles verify offline and expose tampering', ['P-AC-12']],
      ['Bundle artifacts resolve through canonical inventory', ['P-AC-06']],
      ['Invalid/misplaced/orphaned/unreconciled artifacts cannot enter silently', ['P-AC-06', 'P-AC-12']],
      ['Private overlays cannot smuggle private authority or coordinates', ['P-AC-05']],
      ['Threat model and migration/versioning are documented', ['P-AC-13']],
    ],
  },
  17: {
    title: 'Define a sanitized multi-agent event model and local replay view',
    rows: [
      ['Raw messages/prompts/credentials/private paths/logs excluded by default', ['L-AC-06', 'A-AC-06']],
      ['Unknown and unavailable remain distinct', ['K-AC-09']],
      ['Replay detects broken correlation and candidate invalidation', ['L-AC-05']],
      ['Replay is non-authoritative and links canonical evidence', ['L-AC-04', 'L-AC-05', 'V-AC-03', 'V-AC-07']],
      ['Serial/parallel/retry/cancellation/malicious fixtures', ['L-AC-07']],
      ['Design is driven by user/audit needs, not competitor parity', ['L-AC-08']],
    ],
  },
  23: {
    title: 'Define external work-system and knowledge-base traceability adapters',
    rows: [
      ['#22 is the sole canonical artifact/lifecycle source', ['X-AC-10']],
      ['#9 governs mandatory documents and external writes', ['X-AC-11']],
      ['Synthetic issue/wiki/document/secondary-forge adapters share one core', ['X-AC-12']],
      ['Every synchronized field/section has one ownership class', ['X-AC-02']],
      ['Reference-only/outbound projection is the default', ['X-AC-13']],
      ['Bidirectional mode rejects unmapped fields/conflicts', ['X-AC-04', 'X-AC-13']],
      ['External status/prose cannot grant Pipeline authority/evidence', ['X-AC-05']],
      ['Protected publication requires preview/digest/revision/readback/receipt', ['X-AC-03']],
      ['Externally owned sections cannot be overwritten', ['X-AC-02', 'X-AC-04']],
      ['Stale/deleted/inaccessible/duplicate/out-of-order states are typed', ['X-AC-06']],
      ['Writes support preview and capability-bounded idempotent retry', ['X-AC-03', 'K-AC-02', 'K-AC-03']],
      ['External outage cannot erase local authority', ['X-AC-14']],
      ['Credentials/private coordinates stay out of portable evidence', ['X-AC-07']],
      ['Provider-specific names stay outside core schemas', ['X-AC-08']],
      ['Contract/threat/mapping/publication/conformance docs exist', ['X-AC-15']],
      ['#24 consumes the contract without provider-specific core fields', ['X-AC-08', 'C-AC-11']],
    ],
  },
  24: {
    title: 'Add policy-governed ITSM change control to release and promotion',
    rows: [
      ['Existing deploy adapter remains independent/provider-neutral', ['C-AC-08', 'C-AC-11']],
      ['Environment selects no control or exactly one effective profile', ['C-AC-09']],
      ['One artifact/environment binds both authorities, deploy, evidence, rollback, close', ['C-AC-01', 'C-AC-03', 'C-AC-05', 'C-AC-06']],
      ['Automatic creation/documentation never implies approval', ['C-AC-10']],
      ['Invalid/stale/wrong-window/wrong-artifact mandatory records block', ['C-AC-04']],
      ['Standard/normal/emergency/not-required have distinct behavior', ['C-AC-02']],
      ['Status text or unauthenticated actor cannot satisfy Pipeline authority', ['C-AC-03', 'C-AC-04']],
      ['Failure/rollback updates retain the failed attempt', ['C-AC-05']],
      ['Post-deploy external-write failure enters reconciliation', ['C-AC-06']],
      ['Synthetic core; named products only in profiles', ['X-AC-12', 'C-AC-11']],
      ['Advisory/mandatory offline and unavailable behavior is explicit', ['C-AC-12']],
      ['Threat/policy/migration/runbook/recovery docs exist', ['C-AC-13']],
    ],
  },
  30: {
    title: 'Add a repository-scoped tamper-evident human governance decision ledger',
    rows: [
      ['Every human authority transition records a decision first', ['H-AC-01', 'H-AC-12']],
      ['Mutable state without a valid decision cannot grant authority', ['H-AC-02']],
      ['Full decision lifecycle is reconstructable', ['H-AC-03', 'H-AC-05', 'H-AC-06', 'H-AC-11']],
      ['Decisions bind every policy-required target dimension', ['H-AC-04']],
      ['Cross-repository writes/consumption are rejected', ['H-AC-07', 'H-AC-09', 'K-AC-06']],
      ['Revocation/correction/expiry/supersession append history', ['H-AC-06']],
      ['Interrupted/concurrent append recovers without silent split authority', ['K-AC-04', 'K-AC-05', 'K-AC-07']],
      ['Idempotent duplicate submission cannot duplicate authority', ['K-AC-02', 'K-AC-03']],
      ['Truncation/reorder/change/fork/path/hash failures verify offline', ['K-AC-05', 'K-AC-06', 'K-AC-08']],
      ['Guard/plan/release/deploy/override paths reference decision IDs', ['H-AC-12']],
      ['Unverified legacy material cannot satisfy a current gate', ['H-AC-08']],
      ['Secrets/prompts/transcripts/commands/private paths are excluded', ['H-AC-13']],
      ['#5 renders the timeline without authority', ['V-AC-03', 'V-AC-07']],
      ['#9 bundles verified ledger records/integrity', ['P-AC-06', 'P-AC-12']],
      ['#24 links external and Pipeline decisions without conflation', ['C-AC-03']],
      ['Schema/taxonomy/authority/threat/migration/retention/recovery docs exist', ['H-AC-14']],
      ['Complete decision/failure/privacy fixture set', ['H-AC-15']],
    ],
  },
  31: {
    title: 'Add a privacy-preserving agent decision and assumption journal',
    rows: [
      ['Closed schema/materiality policy selects journaled events', ['A-AC-01', 'K-AC-01']],
      ['Assumption states remain distinct', ['A-AC-11', 'K-AC-09']],
      ['Verification/contradiction/expiry/invalidation/supersession append events', ['A-AC-02']],
      ['Changed assumptions invalidate/revalidate affected work', ['A-AC-03']],
      ['Journal cannot satisfy any authority/evidence gate', ['A-AC-16']],
      ['Human confirmation correlates to #30; only #30 grants authority', ['A-AC-04']],
      ['Runner/model/profile/role/capability carries assurance', ['A-AC-05']],
      ['Prompts/transcripts/reasoning/secrets/private paths/raw output excluded', ['A-AC-06']],
      ['Redaction occurs before local persistence and external projection', ['A-AC-06', 'E-AC-15']],
      ['Mandatory material events are never sampled/discarded silently', ['A-AC-07']],
      ['Retention/access/integrity is independent of human ledger', ['A-AC-12']],
      ['Interrupted/concurrent/duplicate/out-of-order behavior is deterministic', ['A-AC-13']],
      ['Offline verification detects mutation/gaps/forks/path/repository errors', ['K-AC-05', 'K-AC-06', 'K-AC-08']],
      ['#17 replays all origins without authority collapse', ['L-AC-04']],
      ['#5 shows uncertainty/status/decision with evidence', ['V-AC-02', 'V-AC-03']],
      ['Complete assumption/selection/failure/privacy fixture set', ['A-AC-14']],
      ['Schema/taxonomy/materiality/trust/privacy/retention/recovery docs exist', ['A-AC-15']],
    ],
  },
  32: {
    title: 'Add provider-neutral governance event export for SIEM and audit platforms',
    rows: [
      ['Human/agent/lifecycle origin and authority survive export', ['K-AC-10', 'E-AC-01']],
      ['Every export maps one validated source with stable identity/correlation', ['E-AC-01']],
      ['CloudEvents/OTLP/NDJSON/RFC 5424 mappings are deterministic/loss-declared', ['E-AC-02']],
      ['Default export excludes all prohibited/private material', ['E-AC-03', 'E-AC-15', 'E-AC-18']],
      ['Free-form rationale is explicit-policy-only and redacted', ['E-AC-04']],
      ['Sanitization precedes every queue/log/dead-letter/metric/receipt', ['E-AC-15']],
      ['At-least-once/idempotency/order/retry/rate/backpressure/replay/restart tested', ['E-AC-06', 'E-AC-16']],
      ['Duplicate delivery creates no canonical event/authority', ['E-AC-17']],
      ['Partial acceptance advances only acknowledged events', ['E-AC-07']],
      ['Cursor/gap/fork/hash/schema/ack failures are typed', ['E-AC-08']],
      ['Advisory failure preserves canonical operation', ['E-AC-09']],
      ['Required mode blocks only exact named boundary/range', ['E-AC-10']],
      ['Destination/alerts cannot change authority', ['E-AC-12']],
      ['Credentials/endpoints remain outside portable artifacts', ['E-AC-18']],
      ['Multiple destinations are independent', ['E-AC-13']],
      ['Receipts state exact acknowledgement without retention/review claims', ['E-AC-11']],
      ['External event correlates to sources/candidate/evidence/policy/chain', ['E-AC-01', 'K-AC-10']],
      ['#5 shows export lag/failure/receipt state without authority', ['E-AC-19']],
      ['#9 bundles sanitized export-policy/delivery metadata', ['E-AC-20']],
      ['Threat/data-flow/mapping/retention/runbook/recovery docs exist', ['E-AC-21']],
    ],
  },
};

// --- computation ------------------------------------------------------------
function verdictOf(id) {
  const d = DELTA[id];
  if (d) return d;
  const v = VERDICTS[id];
  if (!v) throw new Error(`no verdict recorded for ${id}`);
  return v;
}

const out = [];
const w = (s = '') => out.push(s);

// integrity: every criterion referenced by a bullet must have a verdict
const referenced = new Set();
for (const issue of Object.values(BULLETS)) {
  for (const [, ids] of issue.rows) for (const id of ids) referenced.add(id);
}
const missing = [...referenced].filter((id) => !VERDICTS[id]).sort();

const totals = {};
for (const id of Object.keys(VERDICTS)) {
  const [v] = verdictOf(id);
  totals[v] = (totals[v] || 0) + 1;
}

const MODE = process.argv.includes('--mode') ? process.argv[process.argv.indexOf('--mode') + 1] : 'map';
const open = Object.keys(VERDICTS).filter((id) => verdictOf(id)[0] !== IMPLEMENTED);
const CLASS_ORDER = ['assert', 'doc', 'seam', 'build', 'po'];
const CLASS_TITLE = {
  assert: 'Class A — the behaviour exists, the assertion does not',
  doc: 'Class D — the gap is a documentation section the criterion enumerates',
  seam: 'Class S — two implemented packages, mutually unaware',
  build: 'Class B — an absent capability',
  po: 'Class P — not closeable by writing code',
};

if (MODE === 'closure') {
  const unclassified = open.filter((id) => !CLOSURE[id]).sort();
  const byClass = {};
  const byPackage = {};
  for (const id of open) {
    const entry = CLOSURE[id];
    if (!entry) continue;
    const [cls, wp] = entry;
    (byClass[cls] ||= []).push(id);
    (byPackage[wp] ||= []).push(id);
  }

  w('# Sprint Phoenix — closure design');
  w();
  w('Status: design');
  w();
  w('Date: 2026-08-09');
  w();
  w('Parent specification: [../spec.md](../spec.md) · Measurement: [../evidence/acceptance-evidence-map-20260809.md](../evidence/acceptance-evidence-map-20260809.md)');
  w();
  w('## What this design is for');
  w();
  w(`The measurement established that ${open.length} of ${Object.keys(VERDICTS).length} acceptance criteria are not`);
  w('`implemented` and that no issue is closeable. It did not say how any of them closes. This');
  w('document does, and it is generated from the same verdict data as the measurement, so the two');
  w('cannot drift apart.');
  w();
  w('The central design claim is that the remainder is **not one backlog**. It is five populations');
  w('with different costs, different owners, and different blocking properties, and treating them as');
  w('one list is what has made the epic look larger and more uniform than it is.');
  w();
  if (unclassified.length) {
    w(`**INTEGRITY FAILURE:** open criteria with no closure class: ${unclassified.join(', ')}`);
    w();
  }
  w('| class | criteria | what closing one actually costs |');
  w('|---|---|---|');
  w(`| A — assertion missing | ${(byClass.assert || []).length} | one named test case in an already-registered, unprotected suite |`);
  w(`| D — documentation missing | ${(byClass.doc || []).length} | one document section set; no code, no gate |`);
  w(`| S — seam missing | ${(byClass.seam || []).length} | a connector between two packages that already work |`);
  w(`| B — capability missing | ${(byClass.build || []).length} | real implementation plus its tests |`);
  w(`| P — not code | ${(byClass.po || []).length} | a human gate, a sanctioned authority revision, or a proved impossibility |`);
  w(`| **total** | **${open.length}** | |`);
  w();
  w('**The distribution is the finding.** The largest class by a wide margin is Class A: criteria');
  w('whose behaviour is built, shipped and green, and which fail only because no assertion names the');
  w('clause the criterion actually states. That is not implementation debt. It is the direct');
  w("consequence of the Spec's own bar — `spec.md:673` demands that *every* criterion map to a named");
  w('test, not that its theme be covered — and it means a large fraction of the epic closes through');
  w('test authorship in files that no maintenance window protects.');
  w();
  w('## The gating slice — built, one gate left');
  w();
  w('P-AC-08 is the one criterion whose position in the sequence is fixed by the acceptance matrix');
  w("itself: it declares the feature-package writer the mandatory first slice of PHX-0, and forbids");
  w("PHX-0's ruleset-trust-root slice and PHX-1 from starting until it passes. Everything below was");
  w('sequenced behind it for that reason and no other. It no longer is: the design below is built,');
  w("and this section is now a record of what shipped rather than a proposal.");
  w();
  w('**What was already there.** `feature-package-inspect|status|plan|apply|recover` were built,');
  w('registered and green before this pass. `apply` carried two plan kinds — `bootstrap` for an');
  w('absent manifest and `transition` for a state change — each with a recomputed-preview digest');
  w('check that fails closed on manifest, proposal or target-state drift, a MAC-authenticated');
  w('recovery journal, and a readback before the journal is retired.');
  w();
  w('**What this pass built (`PHX-WP-GATE`, commit 92b21ed).** The criterion additionally requires');
  w("reconciling an inherited `draft` manifest's stale PRD, Spec, acceptance, architecture and Result");
  w('digests — through an existing-manifest preview, an exact PO-bound apply and a readback, **with');
  w('no lifecycle-state, artifact-set, candidate or other authority-byte change**. Neither existing');
  w('plan kind could express that: `transition` exists to change state, which this operation must');
  w('not do, and `bootstrap` applies only when the manifest is absent. `planFeaturePackageReconcile`');
  w('now exists in `lib/feature-package-topology.mjs`, and `feature-package-reconcile` now exists as');
  w('an apply mode in `pipeline-state.mjs`.');
  w();
  w('### As built: the third plan kind, `reconcile`');
  w();
  w('The reconciliation is a **digest-only** transaction, and the no-drift property is structural');
  w('rather than a promise the implementation is trusted to keep:');
  w();
  w('1. **Preview.** `planFeaturePackageReconcile(root, manifestPath, resultAuthority)` recomputes');
  w('   each declared artifact digest from the bytes on disk and returns the preimage manifest, the');
  w('   postimage manifest, and the per-artifact old/new digest pairs, in the same plan-object shape');
  w('   the other two kinds return — so `--plan-sha256` binding is inherited, not reimplemented. The');
  w('   third parameter is one deviation from the original design sketch, added because the Result');
  w('   fence (below) has to be checked on the plan itself and needs Continuity State\'s binding to do');
  w('   it — reported by the dispatch rather than built in silently.');
  w('2. **The no-drift invariant is checked on the plan, not on intent** (`reconcileNoDriftOk`,');
  w('   exported). The postimage is rejected unless it is byte-identical to the preimage after the');
  w('   digest fields alone are substituted: same lifecycle state, same artifact set and order, same');
  w('   candidate, same schema, same every other byte. Four staged cases (`RGb`..`RGb4`) each change');
  w('   one more field — state, candidate, artifact order — and each is refused.');
  w('3. **Apply is PO-bound.** It consumes the same critical-action proof shape the other');
  w('   authority-changing writers use, bound to the exact candidate and to the plan digest. Cases');
  w('   `RGe` prove zero mutation on both the no-approval-function and the rejected-approval path.');
  w('4. **Manual digest replacement is refused** (case `RGf`) — the exact workaround P-AC-08 names');
  w('   and forbids as a substitute for the transaction.');
  w('5. **Readback.** The written manifest is re-read and re-validated through');
  w('   `validateFeaturePackage` before the journal is retired (case `RGc`, DoD 7) — the existing');
  w('   apply path already did this and the reconcile path reuses it rather than adding a second one.');
  w();
  w('### As built: the Result fence');
  w();
  w('The criterion admits a Result reconciliation only under two conditions and refuses a');
  w('metadata-only refresh outright. All three are plan preconditions (`checkResultReconciliationFence`),');
  w('so a refused case never reaches a writer, and each carries its own typed code so evidence can');
  w('tell the refusals apart (cases `RGg1`..`RGg4`):');
  w();
  w('- **`reconcile-result-unbound`** — the current Result is not the one Continuity State binds. A');
  w('  Result the State does not name cannot be reconciled, whatever its digest says.');
  w('- **`reconcile-result-metadata-only`** — no canonical fence marker is present at all: refused by');
  w('  name, distinguishably from a drift refusal, exactly as the criterion requires.');
  w('- **`reconcile-result-fence-mismatch`** — a fence marker is present but the preserved prefix does');
  w('  not hash to the stale manifest digest: a Result that was rewritten, not one that legitimately');
  w('  grew.');
  w('- The positive case (`RGg4`) admits only when the prefix genuinely hashes to the stale digest');
  w('  **and** the Result is Continuity-bound — both conditions, not either.');
  w();
  w('**One thing this design deliberately does not repair.** The reconciliation the criterion was');
  w('written for was already performed by hand in `ece6041`, by the exact route P-AC-08 forbids. The');
  w('capability is still required and was still built; its original subject is gone, and the audit');
  w('trail for that specific repair will never exist. The PO accepted that as a recorded deviation.');
  w('Building the transaction was therefore about the next reconciliation, not that one.');
  w();
  w('### Where P-AC-08 still meets a hard boundary');
  w();
  w('The implementation lives in `plugins/pipeline-core/scripts/pipeline-state.mjs` and');
  w('`lib/feature-package-topology.mjs`, both unprotected, and both are now committed. **Its tests');
  w('are not landed yet, and they cannot be without a human act.** The 26 cases proving the above are');
  w('staged in `evidence/phx-wp-gate-cases.mjs` — re-run independently rather than accepted from the');
  w('dispatch report: **26/26 pass**. Registering them touches');
  w('`harness/scripts/pipeline-state.test.mjs` (TP-5-protected) and, to add the suite entry,');
  w('`harness/scripts/verify.mjs` (TP-3-protected). The protected suite itself was re-run');
  w('independently to confirm no regression from the new code: **418/418, unmodified**.');
  w();
  w('Both protected files are liftable in **one** signed maintenance window');
  w('(`--scope TP-3,TP-5`), whose TTL is four hours — the established pattern this design already');
  w('named, now with the implementation and the staged cases both sitting ready behind it. The window');
  w("is the PO's act and is the one hard gate P-AC-08 has left.");
  w();
  w('## The parallel partition');
  w();
  w('Spec §4.6 admits parallel work only where file ownership does not overlap. The partition below');
  w('is by module family, which makes the disjointness checkable rather than asserted:');
  w();
  w('| work package | open criteria | owns |');
  w('|---|---|---|');
  for (const wp of Object.keys(WORK_PACKAGES)) {
    const ids = (byPackage[wp] || []).sort();
    if (!ids.length) continue;
    w(`| ${wp} | ${ids.length} | ${WORK_PACKAGES[wp].join(', ')} |`);
  }
  w();
  w('Concurrency is bounded at **2**, not by preference but by the recorded capacity: the continuity');
  w('block reserves one Critic slot and one recovery slot out of four, and the project calibration');
  w('sets `wipLimit: 3`. Two is the tighter of the two and therefore the one that governs.');
  w();
  w('## Sequence');
  w();
  w('1. **WP-GATE** alone, because P-AC-08 forbids the rest of PHX-0 and PHX-1 from starting. Its');
  w('   window is the first PO gate.');
  w('2. **Class A and Class D packages in pairs**, highest blocked-bullet yield first. These need no');
  w('   window and no gate: the suites are registered and unprotected, and the documents are ordinary');
  w('   files. This is where most of the remaining count moves.');
  w('3. **Class S**, the five seams. Each is a connector between two working packages and each needs');
  w('   a design decision about which side owns the reference — deliberately sequenced after Class A');
  w('   so the packages being connected are fully pinned first.');
  w('4. **Class B**, the absent capabilities, ordered by whether anything else waits on them.');
  w('   `L-AC-01` leads: no Pipeline path emits a lifecycle event at all, which is the single');
  w('   structural gap behind the epic\'s "libraries built, integration left" shape.');
  w('5. **Class P** last, because most of it only becomes answerable once the rest is done.');
  w();
  w('## Exit criteria');
  w();
  w('This design is finished when every Class A, D, S and B row above is `implemented` under the');
  w('unchanged measurement definition — a named assertion in a gate-registered suite — and the');
  w('measurement is regenerated to prove it. It cannot close Class P, and it does not try:');
  w('EPIC-AC-04 needs a privacy review, an integrated-candidate Critic and the PO\'s acceptance;');
  w('EPIC-AC-03 needs the sanctioned authority revision that only just became executable; and');
  w('H-AC-11\'s GMW half is a proved impossibility that closes by amendment or not at all.');
  w();
  w('## Per criterion');
  w();
  for (const cls of CLASS_ORDER) {
    const ids = (byClass[cls] || []).sort();
    if (!ids.length) continue;
    w(`### ${CLASS_TITLE[cls]} (${ids.length})`);
    w();
    w('| ID | verdict | package | what closes it |');
    w('|---|---|---|---|');
    for (const id of ids) w(`| ${id} | ${verdictOf(id)[0]} | ${CLOSURE[id][1]} | ${POINTERS[id]} |`);
    w();
  }
  const text = out.join('\n') + '\n';
  const oi = process.argv.indexOf('--out');
  if (oi !== -1 && process.argv[oi + 1]) {
    const { writeFileSync } = await import('node:fs');
    writeFileSync(process.argv[oi + 1], text);
    process.stdout.write(`wrote ${process.argv[oi + 1]} (${text.length} bytes)\n`);
  } else process.stdout.write(text);
  process.exit(0);
}

const nImpl = Object.keys(VERDICTS).filter((id) => verdictOf(id)[0] === IMPLEMENTED).length;
const nTotal = Object.keys(VERDICTS).length;
const nBullets = Object.values(BULLETS).reduce((n, i) => n + i.rows.length, 0);

w('# Sprint Phoenix — acceptance evidence map and issue reconciliation');
w();
w('Status: measurement');
w();
w('Date: 2026-08-09');
w();
w('Parent specification: [../spec.md](../spec.md) · Acceptance matrix: [../acceptance.md](../acceptance.md)');
w();
w('## What this document is');
w();
w('One durable record answering two questions the Product Owner asked together: what evidence');
w(`exists for each of the ${nTotal} Phoenix acceptance criteria, and what remains open when those`);
w(`verdicts are reconciled against the ${nBullets} live acceptance bullets of the eight open`);
w('`sprint:phoenix` issues.');
w();
w('It supersedes `acceptance-evidence-map-20260805.md` as the current measurement. It is generated');
w('by its own generator, `acceptance-evidence-map.mjs` in this directory, which carries the verdict');
w('map, the evidence pointers and');
w('the bullet-to-criterion map as auditable data rather than prose — regenerate it after any');
w('re-measurement instead of hand-editing this file.');
w();
w('**Candidate.** Measured at `de69756` on `sprint_phoenix`. The gate evidence belongs to `3387065`');
w('(`evidence/verify-latest.json`: `exitCode 0`, `status passed`, 368 registered suites, 368');
w('terminal receipts, `binding: "exact"`, tree clean at start and finish); the two commits between');
w('that candidate and the measured HEAD touch `docs/` and `backlog/` only, so no product surface');
w('moved. Security: `pipeline.security-verdict.v2`, `blocking: false`, `cap.sast` pass,');
w('`cap.secrets` pass.');
w();
w('**Evidence base.** Four read-only measurements, each dispatched to a fresh context and each');
w('adjudicating from the tree rather than from the handover:');
w();
w('| tag | measurement | scope |');
w('|---|---|---|');
w('| C | `PHX-COVERAGE`, 2026-08-08 | all 157 criteria, first full pass |');
w('| J | `PHX-ADJ2`, 2026-08-08 | the ten criteria the first pass could not adjudicate |');
w('| A | `PHX-FIN-A`, 2026-08-09 | the 13 PX0/P criteria moved by later product commits |');
w('| B | `PHX-FIN-B`, 2026-08-09 | the 10 A/H/EPIC criteria moved by later product commits |');
w();
w('The `A` and `B` runs re-measured, and did not inherit, every row they touched. Their run output');
w('lives under `evidence/` and is git-ignored by QG-03, which is why the operative content is');
w('reproduced here rather than referenced.');
w();
w('## The direct answer');
w();
w(`**Phoenix cannot claim complete.** ${nImpl} of ${nTotal} criteria carry a named assertion in a`);
w(`gate-registered suite; ${nTotal - nImpl} do not. EPIC-AC-05 forbids a completion claim while any`);
w('criterion remains unimplemented or unverified, and it currently bites. No issue is closeable on');
w('its own live acceptance bullets.');
w();
w('The shape of the remainder has not changed since the first pass and is worth stating plainly:');
w('Phoenix built the libraries and left the integration. Most non-implemented rows are not absent');
w('features but unpinned sub-clauses of features that exist — and a smaller, harder set is the');
w('seams between packages that are each individually implemented and mutually unaware.');
w();
w('Closure rule applied verbatim from `specs/sprint-phoenix-epic/design/issue-coverage.md:201-204`:');
w('an issue remains open if any mapped criterion is unimplemented, unverified, dependent on');
w('unpublished sibling work, or deferred without explicit PO disposition, owner and expiry.');
w('A bullet is therefore BLOCKED unless every criterion mapped to it is `implemented`.');
w();
if (missing.length) {
  w(`**INTEGRITY FAILURE:** criteria referenced by a bullet with no recorded verdict: ${missing.join(', ')}`);
  w();
}

w('## Criterion verdict totals');
w();
w('| verdict | count |');
w('|---|---|');
for (const k of ['implemented', 'partial', 'designed-only', 'not-started', 'constraint']) {
  w(`| ${k} | ${totals[k] || 0} |`);
}
w(`| **total** | **${Object.keys(VERDICTS).length}** |`);
w();

const noPointer = Object.keys(VERDICTS).filter((id) => !POINTERS[id]).sort();
if (noPointer.length) {
  w(`**INTEGRITY FAILURE:** criteria with a verdict but no evidence pointer: ${noPointer.join(', ')}`);
  w();
}

w('## Per criterion — verdict and evidence');
w();
w('`src`: **C** = the 2026-08-08 baseline measurement, **J** = its ten-row adjudication follow-up,');
w('**A**/**B** = the 2026-08-09 delta re-measurement. For `implemented`, the pointer names the');
w('gate-registered suite that pins the operative clause; for every other verdict it names the exact');
w('clause that is not pinned or not built.');
w();
const GROUPS = [
  ['PX0', 'Lifecycle-authority revision and runner-neutral ruleset source'],
  ['K', 'Governance event kernel'],
  ['H', 'Human Governance Decision Ledger (#30)'],
  ['A', 'Agent Decision and Assumption Journal (#31)'],
  ['L', 'Lifecycle stream and replay (#17)'],
  ['P', 'Policy packs and signed audit bundles (#9)'],
  ['V', 'Human-readable Evidence Viewer (#5)'],
  ['X', 'Traceability and documentation adapters (#23)'],
  ['C', 'ITSM change control (#24)'],
  ['E', 'Governance event export (#32)'],
  ['R', 'External command offer, workaround and recovery audit profile'],
  ['EPIC', 'Epic integration and release'],
];
for (const [prefix, title] of GROUPS) {
  const ids = Object.keys(VERDICTS).filter((id) => id.slice(0, id.lastIndexOf('-AC-')) === prefix);
  const impl = ids.filter((id) => verdictOf(id)[0] === IMPLEMENTED).length;
  w(`### ${prefix} — ${title} (${impl}/${ids.length} implemented)`);
  w();
  w('| ID | verdict | src | evidence / named gap |');
  w('|---|---|---|---|');
  for (const id of ids) {
    const [v, s] = verdictOf(id);
    w(`| ${id} | ${v} | ${s} | ${POINTERS[id]} |`);
  }
  w();
}

w('## Per issue');
w();
const summary = [];
for (const num of Object.keys(BULLETS).map(Number).sort((a, b) => a - b)) {
  const issue = BULLETS[num];
  const blocked = [];
  const clear = [];
  for (const [text, ids] of issue.rows) {
    const bad = ids.filter((id) => verdictOf(id)[0] !== IMPLEMENTED);
    if (bad.length) blocked.push([text, bad]);
    else clear.push(text);
  }
  summary.push([num, issue.rows.length, clear.length, blocked.length]);

  w(`### #${num} — ${issue.title}`);
  w();
  w(`${clear.length} of ${issue.rows.length} live acceptance bullets fully carried; **${blocked.length} blocked**.`);
  w();
  if (blocked.length === 0) {
    w('No blocking criterion. Closeable subject to the epic-level gates (EPIC-AC-01..06).');
    w();
    continue;
  }
  w('| # | live acceptance bullet | blocking criteria (verdict) |');
  w('|---|---|---|');
  blocked.forEach(([text, bad], i) => {
    const cells = bad.map((id) => `${id} (${verdictOf(id)[0]})`).join(', ');
    w(`| ${i + 1} | ${text} | ${cells} |`);
  });
  w();
}

w('## Summary');
w();
w('| issue | bullets | carried | blocked | closeable |');
w('|---|---|---|---|---|');
for (const [num, total, clear, blocked] of summary) {
  w(`| #${num} | ${total} | ${clear} | ${blocked} | ${blocked === 0 ? 'yes' : '**no**'} |`);
}
const closeable = summary.filter(([, , , b]) => b === 0).length;
w();
w(`Issues closeable on their own live acceptance bullets: **${closeable} of ${summary.length}**.`);
w();

// distinct blocking criteria, ranked by how many bullets they block
const blockCount = new Map();
for (const issue of Object.values(BULLETS)) {
  for (const [, ids] of issue.rows) {
    for (const id of ids) {
      if (verdictOf(id)[0] !== IMPLEMENTED) blockCount.set(id, (blockCount.get(id) || 0) + 1);
    }
  }
}
w('## The blocking set, ranked');
w();
w(`${blockCount.size} distinct criteria block at least one live acceptance bullet.`);
w();
w('| criterion | verdict | live bullets blocked |');
w('|---|---|---|');
for (const [id, n] of [...blockCount.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))) {
  w(`| ${id} | ${verdictOf(id)[0]} | ${n} |`);
}
w();

// criteria carried by NO live bullet: the Phoenix-only strictness surface
const unreferenced = Object.keys(VERDICTS).filter((id) => !referenced.has(id)).sort();
w('## Criteria not mapped to any live issue bullet');
w();
const unrefOpen = unreferenced.filter((id) => verdictOf(id)[0] !== IMPLEMENTED);
w(`${unreferenced.length} of ${Object.keys(VERDICTS).length} criteria are Phoenix's own stricter contract rather than a live issue obligation.`);
w('They block no issue, but EPIC-AC-05 still forbids an epic completion claim while any of them is not `implemented`.');
w(`${unrefOpen.length} of those ${unreferenced.length} are currently not \`implemented\` and are listed below; the rest are omitted because they are done.`);
w();
w('| criterion | verdict |');
w('|---|---|');
for (const id of unrefOpen) w(`| ${id} | ${verdictOf(id)[0]} |`);
w();

w('## The epic gates, one by one');
w();
w('EPIC-AC-04 names seven gates for a completion claim. Their current state, so that the remaining');
w('work is not mistaken for paperwork:');
w();
w('| gate | state | evidence |');
w('|---|---|---|');
w('| Focused package checks | **partial** | per-package suites are green; the signed TP-3+TP-5 window was used and the reconcile suite is now gate-registered (444/444), but an independent Critic FAIL (2026-08-09, F3) found no shipped entry point ever supplies the required approval resolver -- the command is built and tested but structurally unreachable by any real caller |');
w('| Full Verify | **not verifiable for the integrated candidate** | `evidence/verify-latest.json` binds `3387065`, an ancestor of the whole reviewed range -- an independent Critic (2026-08-09, F5) found no full-gate Verify run is bound to the current candidate; per-suite reruns are not a substitute |');
w('| Blocking Security | **passed (as of `3387065`, not re-run against the integrated candidate)** | `pipeline.security-verdict.v2` — `blocking: false`, `cap.sast` pass, `cap.secrets` pass |');
w('| Privacy review | **absent** | no privacy-review artifact exists for the integrated candidate |');
w('| Independent high-risk Critic | **FAIL, 2026-08-09** | one full-range Critic dispatch reviewed all 57 commits from the epic-wide measurement through this correction; verdict FAIL, 5 major + 2 minor findings; F1/F3/F4/F5 addressed in this same correction, F2/F6 filed as disclosed defects (see backlog) |');
w('| Exact branch push and readback | **passed** | `origin/sprint_phoenix = 3387065`, readback OID equality confirmed, approval bound to that exact commit |');
w('| Explicit PO acceptance | **absent** | the only recorded PO approval binds the first implementation dispatch (EPIC-AC-06), not completion |');
w();
w('Two epic criteria are open for reasons that are not implementation debt and cannot be closed by');
w('writing code:');
w();
w('- **EPIC-AC-03** — a deviation is recorded and unrepaired: the bound Spec §7 inventory omits six');
w('  already-implemented Phoenix modules. The criterion requires the Spec updated and the affected');
w('  approval renewed; the sanctioned route is the continuity-authority revision writer, which now');
w('  exists (PX0-AC-02 implemented), so this is executable where it previously was not.');
w('- **H-AC-11** — its own PO amendment records that Increment 1 does **not** satisfy the');
w('  no-join-handle clause for the GMW half, as a proved impossibility rather than an unfinished');
w('  implementation. It closes only by a separately reviewed amendment scoping the clause, or by');
w("  changing GMW's machine-local storage. Tracked as O-4.");
w();

// The repository's closed shell grammar admits no redirects, so the output path
// is an argument rather than a `>` redirection.
const outIdx = process.argv.indexOf('--out');
const text = out.join('\n') + '\n';
if (outIdx !== -1 && process.argv[outIdx + 1]) {
  const { writeFileSync } = await import('node:fs');
  writeFileSync(process.argv[outIdx + 1], text);
  process.stdout.write(`wrote ${process.argv[outIdx + 1]} (${text.length} bytes)\n`);
} else {
  process.stdout.write(text);
}
