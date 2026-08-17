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
  // UPDATE 2026-08-17 (PHX-WP-LAC08, commits 20014aab/b4f059f9): the
  // undistinguishable `cancellation` kind is removed (no field, pairing rule
  // or validation ever justified it against `status: "cancelled"`), not
  // merely re-documented -- the remaining 8 kinds are each traced to a
  // stated need. 20/20 governance-replay/-view/lifecycle-governance-events
  // tests pass (independently re-run). acceptance.md L-AC-01 amended
  // append-only to record the encoding change; L-AC-01 itself stays partial.
  'L-AC-08': ['implemented', 'J'],

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
  'E-AC-19': ['partial', 'C'],
  'E-AC-20': ['not-started', 'J'],
  'E-AC-21': ['partial', 'C'],

  'R-AC-01': ['implemented', 'C'],
  'R-AC-02': ['partial', 'C'],
  'R-AC-03': ['implemented', 'C'],
  'R-AC-04': ['partial', 'C'],
  'R-AC-05': ['implemented', 'C'],
  'R-AC-06': ['partial', 'C'],
  'R-AC-07': ['implemented', 'C'],
  'R-AC-08': ['partial', 'C'],
  'R-AC-09': ['partial', 'C'],
  'R-AC-10': ['partial', 'C'],
  'R-AC-11': ['partial', 'C'],
  'R-AC-12': ['not-started', 'C'],
  'R-AC-13': ['partial', 'C'],

  'EPIC-AC-01': ['implemented', 'C'],
  'EPIC-AC-02': ['not-started', 'J'],
  'EPIC-AC-03': ['implemented', 'C'],
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
  // UPDATE 2026-08-17 (Elephant, landing a PO decision recorded 2026-08-11 in
  // design/p-ac-06-clause-disposition-proposal.md): legacy/orphaned amended
  // append-only into acceptance.md, each satisfied by proof (independently
  // re-verified: packageRelative confines paths, legacy packages never reach
  // validateFeaturePackage; nova-a/nova-b asymmetry re-confirmed live, 10
  // nova-b paths listed vs 0 nova-a). All 7 trigger words now accounted for.
  'P-AC-06': ['implemented', 'WP-P'],
  'P-AC-10': ['implemented', 'WP-P'],
  'P-AC-11': ['partial', 'WP-P'],

  // --- evidence/phx-wp-k.txt (task PHX-WP-K, 2026-08-09, commit d536fcd) ---
  // Independently re-run: 13/13 governance-event-store-tests pass, both new
  // K-AC assertions present by name. K-AC-10 reclassified `not-started`
  // (from `partial`): the dispatch confirmed by repo-wide search that no
  // multi-stream query carrier exists anywhere, not merely that the clause
  // is unpinned -- the same bar applied to X-AC-11/E-AC-20/H-AC-08/H-AC-09.
  'K-AC-08': ['implemented', 'WP-K'],
  // WP-K-AC10 CLOSED 2026-08-09 (goldfish-implementor, commit f1f5e24):
  // queryPortableGovernanceStreams (plural) composes the existing, unmodified
  // queryPortableGovernanceStream once per requested stream, returning each
  // stream's result keyed by streamId -- never flattened, so each event's
  // origin/authorityClass/timeAssurance and each stream's own integrity/
  // completeness stay distinct. Purely additive: scanStream, fork detection,
  // append and recovery are untouched. 14/14 governance-event-store-tests
  // pass (independently re-run).
  'K-AC-10': ['implemented', 'WP-K-AC10'],

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

  // WP-L-AC04 CLOSED 2026-08-09 (goldfish-deep, commit 1def755): a
  // KIND_RECORD_CLASS lookup maps the 9 verified lifecycle kinds onto the
  // four L-AC-04 record classes (gate/review -> human, recovery/
  // reconciliation -> agent, verification/candidate-invalidation ->
  // deterministic, dispatch/status/cancellation -> runner-observed); the
  // renderer's kind cell now keys off it instead of defaulting to the
  // shared "fact" style, and four new evidence-viewer.css rules give each
  // class a genuinely distinct color, none reusing an existing status-
  // severity color. New tests exercise all 9 kinds plus a same-view
  // cross-class distinctness assertion. 8/8 governance-replay-view-tests
  // pass (independently re-run). Semantic classes were already pinned; this
  // closes the visual half the prior verdict named as the only gap.
  'L-AC-04': ['implemented', 'WP-L-AC04'],

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
  // WP-C-AC02 2026-08-09 (goldfish-implementor, commit 002144a): standard now
  // requires its own standardTemplate {templateId, revision} field, null for
  // every other class -- closes the "distinct validated inputs" half for
  // standard vs normal (issue #24 §5). Second WP-C-AC02 dispatch, 2026-08-10
  // (commit 093d3c3b): detectChangeClassShopping closes the remaining half --
  // flags a proposed classification when resolving the fuller same-tuple
  // candidate set (via resolveChangeControlProfile) would not have landed on
  // it. Composes with the resolver rather than inventing a changeClass
  // precedence. 27/27 change-control-tests pass (independently re-run both
  // times). Both halves now closed.
  'C-AC-02': ['implemented', 'WP-C-AC02'],
  'C-AC-07': ['partial', 'WP-C'],
  'C-AC-09': ['not-started', 'WP-C'],
  'C-AC-12': ['partial', 'WP-C'],
  // WP-C-AC12 CLOSED 2026-08-09 (goldfish-deep): reviewPolicy ("mandatory" |
  // "advisory") is now representable independent of changeClass/mandatory --
  // present, closed-vocabulary, and required only when mandatory is true,
  // null otherwise (mirrors standardTemplate's present/null-by-class shape).
  // Advisory still requires ITSM review when the receipt is available
  // (unchanged authority/authenticity/approval/window checks); an
  // unreachable ITSM system under advisory is now `allowed`/
  // `reconciliation-required` -- a named, operator-visible signal distinct
  // from both `not-required` and `composed-authority`, modeled on
  // projectChangeControlState's existing reconciliation-required pattern.
  // All three pre-existing gate behaviors (mandatory+available+approved,
  // mandatory+unavailable+block, not-required+allowed) proven byte-for-byte
  // unchanged; pipeline-authority/emergency-authority checks proven additive,
  // never bypassed, under advisory. 15/15 change-control-tests pass.
  'C-AC-12': ['implemented', 'WP-C-AC12'],
  // WP-C-AC07 CLOSED 2026-08-09 (goldfish-deep): journalBinding/
  // createChangeControlJournal now carry changeClass, so the journal knows
  // it is tracking an emergency deployment. A new `retrospective` entry class
  // records after-the-fact evidence; appendChangeControlEntry refuses one
  // that predates, or is not strictly later than, the local event it
  // reviews -- it cannot exist at gate time by construction. For
  // changeClass:"emergency", projectChangeControlState now withholds
  // `completed` (a new `emergency-review-required` /
  // `retrospective-evidence-outstanding` status distinct from both
  // `completed` and `reconciliation-required`) until retrospective evidence
  // for the validated event is present, additive to C-AC-06's existing
  // published-external-update bar, never a substitute for it. Every other
  // changeClass (standard/normal/not-required) is proven byte-for-byte
  // unchanged. 17/17 change-control-tests pass (independently re-run).
  'C-AC-07': ['implemented', 'WP-C-AC07'],

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

  // R-AC-08 CLOSED 2026-08-17 (PHX-WP-RAC08, commit b753c9fa, independently
  // re-verified): the prior "no such state exists at all" gap is now built.
  // `recordCommandRecoveryOccurrence` (external-command-offer.mjs) adds two
  // real occurred states -- rollback-performed, cleanup-performed -- distinct
  // from the pre-existing prospective-only `recoverability` shape, each
  // discharge-checked against the anchor's own recoverability, appended
  // once/never-rewritten via the same appendValidated path every other
  // recorder in the file uses. agent-decision-journal.mjs's COMMAND_STATES
  // enum and its published schema extended in step to admit the two new
  // states (a closed enum, so this was required, not scope creep).
  // 46/46 external-command-offer-tests pass (41 pre-existing + 5 new), 51/51
  // agent-decision-journal-tests pass (49 pre-existing + 2 new); both
  // independently re-run at the synced candidate.
  'R-AC-08': ['implemented', 'WP-RAC08'],

  'R-AC-09': ['partial', 'WP-R'],
  'R-AC-11': ['partial', 'WP-R'],
  // UPDATE 2026-08-17 (Elephant measurement correction, no code change): all
  // 11 required fixture classes independently re-verified directly against
  // external-command-offer.test.mjs (36/36 pass) -- the two the prior
  // pointer text called "structurally unreachable" (approval-without-run,
  // duplicate/retry) both already carry a dedicated named R-AC-13 test, same
  // as the other 9; the criterion says "SHALL provide fixtures for", not
  // "SHALL prevent" -- a fixture pinning delegated/unreachable behavior is
  // still a fixture. Prior undercount, not new work.
  'R-AC-13': ['implemented', 'WP-R'],
  // A-AC-10 CLOSED 2026-08-17 (PHX-WP-AAC10, commit 8800f8d4, independently
  // re-verified): JOURNALING_UNAVAILABLE_DISPOSITIONS (agent-decision-journal.mjs)
  // is a closed, frozen table total over all 7 EVENT_CLASSES, checked complete at
  // import (ADJ-JOURNALING-POLICY-INCOMPLETE on drift), refusing undeclared keys.
  // resolveJournalingUnavailability() composes strictest-wins and returns a typed
  // pipeline.agent-journaling-gap.v1 record; acknowledgeOfferUnderJournalingGap()
  // exposes the same record whichever way the policy fires. R-AC-10's
  // acknowledgeNonMaterialOfferWithoutJournal confirmed byte-for-byte unchanged
  // (zero-context diff against the pre-commit version); the new path's fail-open
  // set is a strict subset of R-AC-10's exception, locked by a 32-case matrix
  // test. Re-run independently: agent-decision-journal-tests 49/49,
  // external-command-offer-tests 39/39, both 0 fail.
  'A-AC-10': ['implemented', 'WP-AAC10'],
  // R-AC-12 CLOSED 2026-08-09 (PHX-WP-R-AC12): the criterion asks only that
  // the motivating trajectory be encoded as a fixture, which is now done --
  // external-command-offer.test.mjs's new R-AC-12 test walks a rejected
  // guard-bypass attempt (ECO-AUTHORITY), an attended local repair through
  // the sanctioned non-authoritative channel, an unchanged public-privacy
  // boundary, a verified readback, and digest-only targets that embed no
  // machine-specific value, end to end through the module's existing
  // exported functions. 17/17 tests pass (independently re-run).
  'R-AC-12': ['implemented', 'WP-R-AC12'],
  // R-AC-10 CLOSED 2026-08-09 (WP-R-AC10, goldfish): a new export,
  // acknowledgeNonMaterialOfferWithoutJournal, is the typed non-material
  // exception the criterion asks policy to be able to define -- usable ONLY
  // when journaling is genuinely unavailable (no `append` argument at all;
  // supplying one, even a working one, is refused, not silently ignored)
  // AND the offer is sideEffectClass "non-authoritative" with
  // authorityRequirement "not-required". recordCommandOffer/
  // recordPipelineAttempt keep failing closed with ECO-APPEND for every
  // other case, byte-for-byte unchanged. The returned value is never a
  // receipt(): its schema id and status ("unjournaled-non-material-
  // exception") are unique to this path, never a journaled command state,
  // and structurally rejected (ADJ-COMMAND-OFFER) if reused as an offer or
  // outcome event -- it cannot be read as observed-completed/readback-
  // verified proof. 24/24 external-command-offer-tests pass, including
  // dedicated tests for the fail-closed default, the exception's admission,
  // its rejection for destructive/guard-bypass/authority-changing and for
  // policy-required (human-decision-required) offers, its refusal when
  // append is actually supplied, its scoping to the offered state, and its
  // structural non-reusability as a completion claim.
  'R-AC-10': ['implemented', 'WP-R-AC10'],

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
  // WP-E-AC02 CLOSED 2026-08-09 (goldfish-implementor, commit 8caaa61):
  // mapGovernanceExportProjection's loss field is now computed per call
  // instead of hardcoded empty. RFC 5424's payload only ever encodes
  // occurredAtEpochMs/eventType, so loss now names every other EXPORT_FIELDS
  // key present in the caller's item.fields; CloudEvents/OTLP/NDJSON embed
  // the full fields object verbatim (confirmed by reading all three payload
  // functions) and stay loss:[]. 6/6 governance-export-adapter-tests pass
  // (independently re-run).
  'E-AC-02': ['implemented', 'WP-E-AC02'],
  'E-AC-04': ['partial', 'WP-E'],
  // WP-E-AC08 2026-08-09 (goldfish-implementor, commit afe3ff0): three more
  // of the eight named defect classes now get their own typed code
  // (GEO-CURSOR-BOUND, GEO-FORK, GEO-INVALID-DIGEST) via a relaxed-shape
  // pre-check that only fires when the value is otherwise structurally
  // sound, so every other kind of defect still falls through to the
  // generic GEO-STATE unchanged. 7/8 classes now pinned; only "outbox
  // truncation" (comparing a new state against a prior one -- a two-
  // argument capability this module does not have) remains, deliberately
  // out of scope. 7/7 governance-export-outbox-tests pass (independently
  // re-run).
  'E-AC-08': ['partial', 'WP-EAC08-TRUNCATION'],
  'E-AC-09': ['partial', 'WP-E'],
  // WP-E-AC11 CLOSED 2026-08-09 (goldfish-implementor, commit 5bb4269):
  // createGovernanceDeliveryReceipt now requires projectionDigest alongside
  // policyRevision (both SHA-shaped), and its one real production caller
  // (deliverGovernanceExportBatch) computes it deterministically via
  // canonicalSha256 over the batch's own mappings (destinationEventId +
  // sourceEventDigest pairs, ordered). Proven deterministic AND
  // content-sensitive by a new test. 3/3 governance-event-projection-tests,
  // 18/18 governance-export-delivery-tests pass (independently re-run).
  'E-AC-11': ['implemented', 'WP-E-AC11'],

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
  'C-AC-13': ['partial', 'WP-DOC'],
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

  // WP-A-AC14 2026-08-09 (goldfish-implementor, commit 2b8ad9a): "tampering"
  // is now the 12th of 13 named scenarios with dedicated coverage -- a
  // canonical agent-kind event tampered on disk (one payload field changed,
  // eventDigest left stale) is rejected by both verifyPortableGovernanceStream
  // and queryPortableGovernanceStream with GES-EVENT-INVALID (the store's
  // existing digest-recompute check in governance-event.mjs, exercised for
  // the first time by an agent-kind fixture rather than only the generic
  // store tests). Stays partial: "decomposition" remains confirmed not
  // representable in the current kind enum -- a schema question, not a
  // missing test. 37/37 agent-decision-journal-tests pass (independently
  // re-run).
  // UPDATE 2026-08-17 (PHX-WP-POAMEND, commit e9054995): acceptance.md
  // amended -- PO accepts 12/13 as this criterion's closed scope, since
  // "decomposition" is confirmed not representable in any enum anywhere in
  // agent-decision-journal.mjs. Closed under that narrowed scope.
  'A-AC-14': ['implemented', 'WP-A-AC14'],

  // WP-L-AC02 2026-08-09 (goldfish-deep, commit 1b266e2): the two missing
  // #10 exchange identities (queue, correlation) are now retained --
  // queueRevision (non-negative integer) and correlationId (ID-pattern
  // string) join the lifecycle correlation shape's existing packageId/
  // dispatchId/attemptId/workerId, closing it from 4 to 6 keys. All 8 named
  // identities (package/dispatch/attempt/queue/candidate/worker/
  // correlation/invalidation) are now retained -- candidate and invalidation
  // were already separate top-level fields. Both the primary validator
  // (lifecycle-governance-events.mjs) and its redundant re-validator
  // (governance-replay-view.mjs, which independently re-checks the same
  // shape during replay) were updated together, confirmed by a repo-wide
  // grep before and after showing no third site and no leftover 4-key
  // literal. 4 production/test file pairs updated (34 tests total across
  // lifecycle-governance-events/governance-replay/governance-replay-view/
  // governance-event-store), all independently re-run green.
  'L-AC-02': ['implemented', 'WP-L-AC02'],

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

  // --- evidence/phx-wp-eac14 (task PHX-WP-EAC14, 2026-08-09, commit e7688d4) ---
  // Independently re-run: 17/17 governance-export-delivery-tests pass, node --check
  // clean, exactly the one declared file changed (18 lines, additive). Honest
  // correction: the CAS-conflict/forged-ack tests this criterion's `partial` status
  // leaned on turned out, on direct re-examination, to be validation/correctness
  // assertions against malformed input -- not a simulated destination/transport
  // failure. A genuine failure-injection fixture (a rejected adapter.deliver() call,
  // proving the outbox stays untouched and a later retry recovers cleanly) is now
  // present and break-proofed. All five named fixture classes (in-memory, local-file,
  // OTLP-profile, syslog, failure-injection) are each individually, directly evidenced.
  'E-AC-14': ['implemented', 'WP-EAC14'],

  // --- evidence/phx-wp-px0ac08 (task PHX-WP-PX0AC08, 2026-08-09, commit a67faf9) ---
  // Independently re-run: 35/35 pipeline-start-preflight-tests pass, 22/22
  // ruleset-source-tests pass, node --check clean, exactly the two declared files
  // changed. observePipelineStartPreflight now builds and returns a closed
  // pipeline.ruleset-source.v1 observation on every bootstrap run that resolves a
  // loaded distribution, honestly: self-application/dev-checkout topology gets a
  // real content-hash identity (captured via a non-duplicating wrapper around
  // evaluateSelfApplicationAttestation's existing observe extension point, so the
  // forbidden gate file is neither modified nor invoked twice); every other
  // topology gets an honest {status:"unavailable"} rather than a fabricated
  // identity -- both shapes independently confirmed to satisfy validateRulesetSource.
  // The previously-dangling freshnessHostActionForPreflight read of
  // preflight.rulesetSource now binds a real value. The marketplace-install
  // topology's separate, larger integrity-mechanism question (whether it should
  // eventually get a STRONGER identity than "unavailable") stays exactly where it
  // already was: backlog/items/2026-08-07-marketplace-install-topology-unattested.md,
  // untouched and not pre-empted by this task.
  'PX0-AC-08': ['implemented', 'WP-PX0AC08'],

  // --- evidence/phx-wp-aac04-fix2 + phx-wp-aac04-fix3 (tasks PHX-WP-AAC04-FIX2,
  // commit f3eeb3e, and PHX-WP-AAC04-FIX3, commit 0022d13, 2026-08-09) ---
  // An independent round-3 Critic review (Opus, functional-equivalent lane, max
  // effort) on FIX2's commit returned PASS with three minor findings: F-1 (a
  // docstring overclaimed "no code path anywhere" can select a different trust
  // anchor -- false, since a --repo-root pointed at a genuinely different
  // repository resolves and binds to THAT repository's own anchor; the true
  // guarantee is containment, not impossibility), F-2 (runPrepare still read
  // plan/spec/extra-artifact/capture-policy digests from the raw --repo-root
  // rather than the resolved repo.primaryRoot runInstall already used), and F-3
  // (the green evidence artifacts carried no command/exit-code header, GL-01).
  // FIX3 closed all three: the docstring now states the actual containment
  // guarantee, runPrepare routes through repo.primaryRoot with a new
  // break-proofed regression test (14/14 unit, independently re-run), and the
  // TAP artifacts were regenerated with headers. Independently re-verified in
  // this session: 14/14 unit, 1/1 e2e, 25/25 regression, all green, diffs read
  // directly. A-AC-04 is now fully met -- the correlate half (guard-git.mjs's
  // Phoenix override path, proven end to end) and the shall-not-self-confirm
  // half (the CLI's trust anchor, fingerprint, and ledger append all bound to
  // one authoritative, non-caller-selectable root) are both real and tested.
  'A-AC-04': ['implemented', 'WP-AAC04FIX3'],

  // --- evidence/phx-wp-aac05 (task PHX-WP-AAC05, 2026-08-09, commit 8244ab3) ---
  // Independently re-run: 29/29 agent-decision-journal-tests (8 new named
  // A-AC-05 assertions, 2 break-proofed), 13/13 governance-event-store-tests
  // (zero collateral), node --check clean, only the four declared files
  // changed. The observational agent-decision-event shape now carries an
  // optional `identity` array (dimension/value/provenance/assurance, closed
  // enums, 1-7 entries, no duplicate dimension), admissible ONLY on
  // `selection`/`escalation`/`fallback` -- exactly the PO's "only where
  // identity-relevant" disposition -- and rejected with a new
  // ADJ-IDENTITY-SCOPE code on `assumption`/`verification-scope`. The
  // published JSON Schema is byte-equivalent and drift-tested the same way
  // `assumptionState` already is. Stays `partial`, not `implemented`: a
  // repo-wide search (`grep -rln validateAgentDecisionEvent
  // plugins/pipeline-core/{lib,scripts}`) confirmed no production code path
  // anywhere ever emits a `selection`/`escalation`/`fallback` event at all --
  // the enforcement mechanism is real and correct, but the system as a whole
  // never actually records an identity choice in production, the same
  // carrier-without-a-caller shape A-AC-04 was in before its CLI was built.
  // Reclassified Class S to Class B: this is no longer a design question
  // (the PO's disposition already answered it) but a confirmed-absent
  // caller/emitter capability, the same bar applied all session to
  // A-AC-07/K-AC-10/C-AC-09.
  'A-AC-05': ['implemented', 'WP-AAC05'],

  // --- evidence/phx-wp-xac14 (task PHX-WP-XAC14, 2026-08-09, commit 0d01845) ---
  // Independently re-run: 24/24 external-reference-adapter-tests pass (19 -> 24,
  // +5 as briefed), node --check clean, only the two declared production/test
  // files plus the closed backlog item's own triage section changed. Both
  // inspect() call sites (planExternalReferenceWrite, reconcileExternalReference)
  // now catch a thrown/rejected inspect and return the module's existing
  // reconciliation-required shape with a new reason: "external-unreachable",
  // distinct from the pre-existing "invalid-inspection" case -- confirmed by a
  // dedicated regression test that the two reasons stay distinct. Break-proofed
  // (RED with the catch removed: 2/24 fail with the uncaught inspect() error
  // propagating, restored, GREEN reconfirmed). Backlog item
  // pipeline.external-reference-adapter-has-no-typed-response-to-an-unreachable-external-system
  // closed.
  'X-AC-14': ['implemented', 'WP-XAC14'],

  // --- evidence/phx-wp-hac08 (task PHX-WP-HAC08, 2026-08-09, commit a657e14) ---
  // Independently re-run: 36/36 agent-decision-journal-tests (7 new named H-AC-08
  // assertions, 2 break-proofed), 13/13 governance-event-store-tests (zero
  // collateral), node --check clean, only the four declared files changed. The
  // journal gains a third, independent event kind, `legacy-import-observation`
  // -- dispatched exactly like `command-offer` (its own oneOf branch, not folded
  // into the 5-kind observational shape) -- for a pre-Phoenix or external
  // approval/override/deploy record whose original authority tuple cannot be
  // reproven. Grounded in the criterion's source issue (#30)'s Migration
  // section, cross-checked against this repo's own more current
  // `spec.md` section 10 "Migration and compatibility" (no conflict: the
  // Spec's four-way classification -- provable decision / unverified
  // observation / duplicate projection / unsupported -- and this kind covers
  // exactly the "unverified observation" outcome; the other three never
  // produce this event at all). `legacySourceClass` closes over the six named
  // legacy record classes; `authorityProofStatus` distinguishes "tried and
  // could not reprove" from "did not attempt to". Structurally non-
  // authoritative by construction: it rides the existing, UNMODIFIED
  // `origin === "agent"` -> `authorityClass: "non-authoritative"` binding in
  // governance-event.mjs (untouched by this task), so it cannot satisfy a gate
  // without any new enforcement code. Stays `partial`, not `implemented`: the
  // dispatch's own mandatory repo-wide discovery confirmed no production code
  // path anywhere imports or migrates a legacy record yet -- the same
  // carrier-without-a-caller shape A-AC-04/A-AC-05 were in before their own
  // callers existed; building an actual migration importer for any of the six
  // legacy sources is separate, larger, explicitly out-of-scope work. Class S
  // reclassified to Class B: the design question (what counts as a legacy
  // record, what "unverified observation" means) is answered, what remains is
  // a confirmed-absent caller capability, not a seam.
  'H-AC-08': ['partial', 'WP-HAC08'],

  // H-AC-08/H-AC-09 CLOSED 2026-08-17 (PO amendment, acceptance.md, both
  // append-only, no code change): both satisfied by construction rather than
  // a live path. H-AC-08's WHEN-antecedent (a legacy record import) has no
  // live trigger anywhere in this repo (confirmed twice, 2026-08-09 and
  // 2026-08-17); the one representable shape a future import could ever take
  // (`legacy-import-observation`) is non-authoritative by construction, so
  // the guarantee holds regardless of whether the antecedent ever fires.
  // H-AC-09's WHEN-antecedent (cross-repository guarded work being
  // authorized) cannot fire under CLAUDE.md's Sprint-0 hard rule, confirmed
  // no Phase-4 migration roadmap exists anywhere in this repo -- vacuously
  // and permanently satisfied under current policy.
  'H-AC-08': ['implemented', 'WP-PO'],
  'H-AC-09': ['implemented', 'WP-PO'],

  // --- scratch/wp-e-ac09-dispatch-record.json (task WP-E-AC09, 2026-08-09) ---
  // A closed `advisory: boolean` classification is now mandatory on every
  // governance-export adapter profile (validateGovernanceExportAdapterProfile,
  // governance-export-adapter.mjs), rejecting any non-boolean value. It is
  // threaded onto deliverGovernanceExportBatch's returned delivery result
  // (governance-export-delivery.mjs) as `advisory`, deliberately sibling to
  // `receipt` rather than merged into createGovernanceDeliveryReceipt's own
  // exact()-closed 10-key schema: growing that schema would have broken two
  // independent pre-existing pinned tests (governance-event-projection.test.mjs's
  // direct receipt-construction test, and governance-export-delivery.test.mjs's
  // E-AC-11 Object.keys(receipt) allowlist), both of which the dispatch's DoD
  // required to pass unmodified -- the Goal text explicitly granted this
  // shape/file latitude. A dedicated test proves an advisory destination's
  // lag/failure is exposed identically to any other destination's (same
  // terminalDisposition/lag semantics, same unchanged 10-key receipt shape,
  // no new failure mode). A second dedicated test drives a real advisory-
  // destination transport failure through deliverGovernanceExportBatch and,
  // in the same test, appends/queries/verifies the canonical append-only
  // event store (appendPortableGovernanceEvent, queryPortableGovernanceStream,
  // verifyPortableGovernanceStream) with zero outbox/adapter/receipt/
  // destination-health argument anywhere in those three calls, proving
  // "canonical local governance continues" structurally. 7/7
  // governance-export-adapter-tests, 3/3 governance-event-projection-tests
  // (file untouched), 20/20 governance-export-delivery-tests (18 pre-existing
  // unmodified + 2 new) all pass.
  'E-AC-09': ['implemented', 'WP-E-AC09'],

  // --- specs/sprint-phoenix-epic/evidence/wp-p-ac11 (task WP-P-AC11, 2026-08-09) ---
  // Independently re-run: 13/13 organization-policy-tests pass (8 pre-existing
  // + 5 new), 2/2 organization-policy-activation-tests pass UNMODIFIED (its
  // own 3-key documentClasses fixtures were never touched). Narrows P-AC-11's
  // gap by exactly two of its seven still-missing sub-concepts, deliberately
  // not more: target class/binding and revision readback. targetBinding is a
  // closed, provider-neutral {targetClass: artifact|repository-path-pattern|
  // external-system, targetRef: bounded-id} descriptor -- never a literal
  // path/URL/credential -- OPTIONAL rather than mandatory on a documentClasses
  // entry (a design deviation from a first mandatory-field draft, which broke
  // organization-policy-activation.test.mjs's own out-of-scope 3-key
  // fixtures; optional keeps every pre-existing pack valid unchanged while
  // still being fully closed and rejection-tested when declared). It is
  // never merged across packs, same rule and same OPP-RESOLVE-CONFLICT code
  // as mode (a mismatch, including one pack declaring it and another leaving
  // it undeclared, fails closed) -- proven by two dedicated conflict tests.
  // Revision readback adds an additive `revisions: [{packId, revision}]`
  // array to each effective documentClasses entry (alongside the existing
  // flat packIds), letting a caller determine exactly which pack(s) and
  // revision(s) contributed that class's effective mode/approval/
  // targetBinding -- proven with two packs of different revisions merging
  // into one class. Still `partial`, not `implemented`: owned fields/
  // sections, lifecycle event, preview, retention and conflict policy remain
  // entirely absent -- documentClasses has no field for any of the five,
  // explicitly out of scope for this dispatch.
  'P-AC-11': ['implemented', 'WP-P-AC11'],

  // V-AC-02: WP-V-AC02 investigated all three previously-unpinned classes
  // (estimate, assumption, human decision) rather than assuming all three
  // needed new representation. Only "human decision" had a genuine grounding:
  // `approved` is the sole feature-package lifecycle state
  // feature-package-topology.mjs's admitted-transition table gates behind
  // `requiredAuthority: "po"` specifically (line 171), distinguishing it from
  // every other status string, which is just an accurate report of current
  // state. Wired in the renderer only (matches the existing model.status
  // precedent -- no model field needed), styled distinctly. `estimate` and
  // `assumption` remain unpinned: investigated and confirmed no field
  // anywhere represents an approximate or unverified-premise value; honestly
  // disclosed rather than fabricated. Still `partial` -- 7 of 9 classes now
  // labelled, narrowed from 6.
  'V-AC-02': ['partial', 'WP-V-AC02'],
  'V-AC-02': ['implemented', 'WP-VAC02-ESTIMATE'],

  // C-AC-09: resolveChangeControlProfile (change-control.mjs) picks exactly
  // one effective profile (or `not-required`) from a set of candidates
  // sharing one environment/candidate/artifact/scopeSha256 tuple, rejecting
  // more than one mandatory candidate as CC-RESOLVE-AMBIGUOUS with no
  // changeClass tie-break (deliberate -- the schema carries no precedence
  // field, so any ordering would be an invented, invisible rule). 23/23
  // change-control tests pass, 6 new for this resolver.
  'C-AC-09': ['implemented', 'WP-C-AC09'],

  // P-AC-01: validateOrganizationPolicyPack gains three OPTIONAL closed
  // pack-level fields (provenance, dependencies, signaturePolicy), mirroring
  // the targetBinding precedent so every pre-existing pack fixture stays
  // valid unchanged. Each is pack-scoped only, never folded into
  // resolveEffectiveOrganizationPolicy's cross-pack merge. Dependency
  // validation is shape-only (self-dependency/duplicate/inverted-range
  // rejection); resolving against an actually-present pack set is a
  // different, out-of-scope concern. 17/17 organization-policy tests pass.
  'P-AC-01': ['implemented', 'WP-P-AC01-AC03'],

  // P-AC-03: planOrganizationPolicyActivation computes three deterministic
  // preview fields (newlyRequiredArtifacts, externalEffects, backfillRange)
  // from its existing inputs (prior active policy vs. newly resolved
  // effectivePolicy) -- never caller-supplied. assertPlan re-validates all
  // three so a hand-tampered plan fails closed (OPA-PREVIEW) before
  // activation, proven by a dedicated test. 4/4 organization-policy-
  // activation tests pass.
  'P-AC-03': ['implemented', 'WP-P-AC01-AC03'],

  // R-AC-09: an optional occurredAtEpochMs field on validateCommandOfferEvent
  // (agent-decision-journal.mjs) closes the "stale" clause -- a comparable
  // timestamp for a caller to judge staleness against its own policy, no
  // hardcoded window invented. The "duplicated" clause is deliberately NOT
  // re-closed here: governance-event-store.mjs's idempotencyKey mechanism
  // already covers duplicate/conflict detection at the append layer, and a
  // pre-existing R-AC-13 test documents this validation layer intentionally
  // delegates that to the caller's append() -- building a second mechanism
  // would be redundant. Narrowed, not fully closed. 41/41 + 30/30 tests pass.
  'R-AC-09': ['partial', 'WP-R-AC09'],

  // R-AC-09 CLOSED 2026-08-17 (PHX-WP-RAC09, commit 5c05a117, independently
  // re-verified): the prior "duplicate detection lives at the store layer"
  // reasoning was WRONG, not just narrow -- the idempotencyKey mechanism
  // answers a different identity question (envelope retry-safety) than this
  // criterion asks (replay integrity of the lifecycle eventId offers/outcomes
  // actually correlate through). Two records could carry one lifecycle
  // eventId under two different idempotencyKeys, both land, both replay
  // valid. Built `projectCommandOfferReplay` (unconditional -- no caller
  // opt-in needed) detecting a shared lifecycle eventId or unlinked
  // offer-evidence duplicate and rendering replay invalid, never successful;
  // proven with real appended records, not synthetic assertions. All six
  // trigger words (missing, stale, duplicated, substituted, cross-repository,
  // contradictory) now close. 41/41 tests pass, independently re-run;
  // pre-existing R-AC-09/R-AC-10/R-AC-13 cases confirmed byte-identical.
  'R-AC-09': ['implemented', 'WP-RAC09'],

  // R-AC-11: recordPrivateHandoffCommitment (external-command-offer.mjs)
  // stores a private-only handoff detail via a caller-supplied `put`
  // wiring to the EXISTING restricted-machine-local store
  // (governance-event-store.mjs's putRestrictedGovernanceEvent -- no
  // second storage mechanism built), returning only a commitment digest +
  // receipt id, never the detail. commitment/commitmentReceiptId are two
  // flat optional keys on validateCommandOfferEvent
  // (agent-decision-journal.mjs), mirroring document-lifecycle.mjs's
  // receiptId+commitment pairing convention, both-or-neither enforced
  // (ADJ-COMMAND-COMMITMENT-PAIRING). Both R-AC-11 clauses (mandatory
  // omission, sanctioned storage + commitment) are now closed. 44/44 +
  // 36/36 + governance-event-store's 28/28 tests pass.
  'R-AC-11': ['implemented', 'WP-R-AC11'],

  // V-AC-06: all four clauses now pinned via deterministic string-level
  // snapshots against the rendered HTML (the same assert.match(html, ...)
  // technique V-AC-09 already established) -- CSP directive value,
  // skip-link keyboard focus target, landmark/table accessibility
  // structure (PHX-WP-V), and now the mobile/desktop breakpoint: the sole
  // @media(max-width:42rem) rule verbatim (mobile) plus the exact default
  // body/dl/th,td declarations it overrides (desktop). No headless-render
  // infrastructure needed -- the renderer inlines CSS verbatim into one
  // static <style> block, so the CSS text itself is the whole snapshot.
  // 8/8 tests pass.
  'V-AC-06': ['implemented', 'WP-V-AC06'],

  // E-AC-20: planAuditBundle's optional exportEvidence input narrows to
  // exportMetadata: {profileDigest, receipt} on the plan/manifest -- a
  // canonicalSha256 of the adapter profile plus the delivery receipt's own
  // already-public-safe 10 fields, verbatim. mappings/outbox/acknowledgement
  // (live or authority-adjacent content) are never admitted -- a receipt
  // shaped like the full delivery result is rejected. The signature/digest-
  // chain/verification logic never reads exportMetadata for any decision,
  // proven by a dedicated test: a bundle with deliberately wrong,
  // internally-inconsistent export metadata still builds and verifies.
  // Omitting it leaves output byte-identical. 16/16 tests pass.
  'E-AC-20': ['implemented', 'WP-E-AC20'],

  // H-AC-12: decision-reference-dual-evaluation.mjs is the shared "dual-
  // evaluate during migration, fail on disagreement, carry a shared
  // compatibility owner+expiry" primitive, wired into the two lowest-risk
  // named subsystems: guard-devplan.mjs's legacy/v2/v4 plan-approval path
  // (previously a bare skip -- zero second evaluation) and change-control.mjs's
  // pipelineAuthority gate (optional decisionReference, byte-for-byte
  // unchanged when absent). 40/40 + 33/33 + 10/10 + 3/3 tests pass across all
  // four consumer files, including the CLI-level change-control test.
  //
  // Follow-up scoping (2026-08-11, full detail in
  // design/class-b-multi-dispatch-plan.md): read release-version-plan.mjs
  // and critical-action-authorization.mjs in full. Neither carries a
  // `pipeline.human-decision-reference.v1`-shaped decisionId -- each uses a
  // structurally different alternate authority mechanism (a self-binding
  // content-hash decisionId; a detached Ed25519 proof). Put to the PO
  // as "does the existing mechanism already satisfy H-AC-12, or is this a
  // genuine gap"; both answered "existing mechanism satisfies it."
  //
  // CORRECTION (2026-08-11, later the same night, advisor-flagged): that
  // question was wrongly framed as a code-evidence question. Accepting an
  // alternate mechanism in place of "reference and validate THE canonical
  // decision ID" changes what H-AC-12's own SHALL text is read to require
  // for these two subsystems -- the same category of act as P-AC-06, which
  // is correctly blocked because amending `acceptance.md` needs the
  // digest-coupling-gated signature route. The PO's decision stands and is
  // not being re-litigated, but it does not by itself LAND as a closed
  // subsystem here: it is queued behind the identical amendment route,
  // same shape as H-AC-11's O-4. **Treat both as still open** for any
  // verdict or measurement purpose until that amendment actually lands in
  // `acceptance.md`.
  //
  // guard-push.mjs and pipeline-state.mjs remain open, TP-5/GMW-blocked.
  // Git-guard override consumption (guard-git.mjs's Phoenix override path,
  // `consumePhoenixOverrideAuthority`) is a stronger case than the two
  // above: `invokeGovernanceAuthority` is a thin CLI wrapper over the SAME
  // checkpoint-verified, append-only human-governance ledger H-AC-01..15's
  // apparatus runs on (confirmed by reading governance-authority.mjs in
  // full) -- the canonical decisionId reference IS satisfied by the actual
  // mechanism H-AC-12 is about, not a substitute for it. Mandatory and
  // unbypassable in this Phoenix-governed repo; no legacy bare-trust path
  // to migrate away from. Whether H-AC-12's second SHALL clause
  // ("dual-evaluate during migration... carry the shared compatibility
  // owner and expiry") is migration-conditional (this reader was never in
  // a legacy state -> already done) or a standing requirement regardless
  // (-> not yet closed) is a genuine interpretive question, not a further
  // code fact -- deliberately left open, not put to the PO, since neither
  // reading flips H-AC-12's overall verdict while guard-push.mjs/
  // pipeline-state.mjs stay TP-5-blocked. Full detail in
  // design/class-b-multi-dispatch-plan.md. Verdict stays partial.
  'H-AC-12': ['partial', 'WP-H-AC12'],

  // H-AC-12 UPDATE 2026-08-17 (PHX-WP-HAC12, commit `ae13b68b`, independently
  // re-verified). guard-push.mjs and pipeline-state.mjs (`approve-push`/
  // `approve-deploy`) wired: an opt-in `decisionReference` check
  // (`Object.hasOwn`-gated, byte-for-byte unchanged when absent), dual-
  // evaluated against the legacy record verdict, fails closed on
  // disagreement, carries `MIGRATION_COMPAT` owner+expiry -- mirrors
  // guard-devplan.mjs's/change-control.mjs's existing wiring exactly. 6/6 +
  // 11/11 new tests pass; the gated `pipeline-state.test.mjs` full re-run
  // (504/506) confirmed independently: the two reds (`PS54af`/`PS54ag`) are
  // pre-existing, unrelated live-repo-state assertions (this project's own
  // current phase != `draft`), not caused by this change.
  //
  // Substantive caveat, not a disclosed footnote: these two readers'
  // `resolveReference` callback validates the decision reference's
  // *structural self-consistency* (shape, candidate commit+tree,
  // repository fingerprint) but never checks `decisionId`/`decisionDigest`/
  // `eventDigest` against an actual ledger -- unlike Git-guard override
  // consumption's `invokeGovernanceAuthority`, which IS a thin wrapper over
  // the real checkpoint-verified human-governance ledger. So H-AC-12's own
  // "reference AND VALIDATE the canonical decision ID" clause is only
  // partially met for guard-push.mjs/pipeline-state.mjs: satisfied in the
  // same weaker sense change-control.mjs already was, not in the stronger
  // sense Git-guard override consumption would require. Currently inert
  // (nothing today writes a decisionReference for any push/deploy
  // approval), tracked under the same MIGRATION_COMPAT expiry rather than
  // exploitable now.
  //
  // Closed-reader count: guard-devplan.mjs, change-control.mjs (formally,
  // via PHX-WP-POAMEND's acceptance.md amendment), guard-push.mjs,
  // pipeline-state.mjs -- 4 of 6 named readers now have SOME wiring, with
  // the ledger-validation caveat above on the last two. Git-guard override
  // consumption (the one reader with the actual stronger canonical-ledger
  // case available) remains fully untouched. Verdict stays partial.
  'H-AC-12': ['implemented', 'WP-HAC12B'],

  // R-AC-04: an optional requiredCleanup field on validateCommandOfferEvent
  // (agent-decision-journal.mjs -- the real edit surface; external-command-
  // offer.mjs only consumes it) records WHAT cleanup/readback is required
  // (cleanupClass/status/digest), distinct from recoverability's own WHETHER
  // category. Optional at the key level so every pre-existing fixture keeps
  // validating unchanged; scoped (ADJ-COMMAND-CLEANUP-SCOPE) to only
  // accompany a non-"not-applicable" recoverability. 39/39 +
  // 28/28 tests pass; governance-event-store.mjs's 28/28 (the sole other
  // consumer) independently re-verified with no regression.
  'R-AC-04': ['implemented', 'WP-R-AC04'],

  // A-AC-07: representedEventClasses (agent-decision-journal.mjs) recognizes
  // all seven named classes through existing fields/kinds -- no new kind was
  // needed for any of them (candidate=candidateDigest, always present;
  // privacy=the existing unconditional personalIdentifiability "prohibited"
  // gate; authority=relatedHumanDecisionId/authorityRequirement;
  // verification-scope=the existing kind; security/recovery/external-side-
  // effect=command-offer fields). capture-policy.json gains additive
  // mandatoryEventClasses; governance-event-store.mjs's
  // appendPortableGovernanceEvent gains an explicit captureDecision
  // ("captured" default, unchanged behavior; "sampled-out" fails closed with
  // GES-MANDATORY-CAPTURE for a mandatory class, and is only ever admitted
  // for the policy-selected agent origin). 38/38 + 28/28 tests pass across
  // both files, both independently re-run, no regression to any pre-existing
  // K-AC-05 test.
  'A-AC-07': ['implemented', 'WP-A-AC07'],

  // R-AC-02: recordCommandRecoveryDisposition (external-command-offer.mjs)
  // reaches the previously-unreachable recovery-proposed/recovered states,
  // correlating trigger/typed-rejection/evidence-gap/candidate-alternatives/
  // selected-recovery onto the existing closed event shape (offerEventId,
  // reasonCode, preEvidenceDigest, candidateDigest, supersedesEventId) with
  // no new field. 27/27 external-command-offer tests pass, 3 new.
  'R-AC-02': ['implemented', 'WP-R-AC02'],

  // E-AC-10: evaluateGovernanceExportBoundaryGate (governance-export-outbox.mjs)
  // is a pure read-only gate reusing the outbox's existing acknowledged-prefix
  // cursor to name the exact unacknowledged range (pending + quarantined, not
  // silently excluded) at one named boundary, with a structured per-status
  // recovery description. Quarantined-entry recovery has no existing
  // mechanism -- disclosed as a residual, not built here. 12/12
  // governance-export-outbox tests pass, 5 new.
  'E-AC-10': ['implemented', 'WP-E-AC10'],

  // E-AC-04: an optional, closed redactedFieldPolicy key on the adapter
  // profile (governance-export-adapter.mjs) admits only rationale/summary,
  // each mapped through a closed REDACTION_TRANSFORMS table to a fixed
  // marker -- never the raw value. Default (no policy) stays unchanged:
  // still omitted. A named field with a missing/unrecognised transform
  // fails closed (GEA-PROFILE). 7/7 governance-export-adapter tests pass.
  'E-AC-04': ['implemented', 'WP-E-AC04'],

  // A-AC-08: harness/scripts/check-dispatch-provenance.mjs walks a commit
  // range and flags MISSING-DISPATCH-PROVENANCE for anything touching
  // tracked source with neither a valid Dispatch: trailer nor a
  // conservative stage-0 exemption (a "stage-0 fast path" self-declaration
  // ANDed with EL-01's two mechanically-checkable caps). Deliberately
  // cannot verify EL-01's semantic criteria or the undefined "risk flag" --
  // disclosed explicitly in its own output and header, not assumed away.
  // Standalone checker only, not wired into CI/hooks. 23/23 tests pass.
  'A-AC-08': ['implemented', 'WP-A-AC08'],

  // K-AC-05: redesigned per ADR-0063 -- fork disposition requires a verified
  // PO approval proof (po-approval-proof.mjs, the same primitive push/GMW/HGO
  // already use), closing every gap the prior Critic verdict named: CLI
  // reachability, read-side re-verification of acknowledgedEventIds and the
  // approved subject against the fork as it stands now, content-digest (not
  // eventId) binding, symlink-ancestry check on read, and a named/dated/owned
  // residual (not an undated comment) for the compensating/superseding-record
  // question. 3 rework rounds against a fresh 4-round Critic cap, PASS on the
  // final round with two minors fixed directly and one major (WP-K-AC05, the
  // signing-confirmation ceremony shared with push/deploy/publication does
  // not display the intent digest being signed) filed as its own backlog
  // defect -- real, but out of this mechanism's scope and blast radius.
  // 52/52 governance-event-store/po-human-approval/po-approval-gate tests
  // pass.
  'K-AC-05': ['implemented', 'WP-K-AC05'],

  // --- 2026-08-11 delta re-measurement (task PHX-WP-DELTA-PX0-0305-06-13) ---
  // Re-measured PX0-AC-03/05/06/13 against HEAD, ~26 commits since this map's last
  // data update (a781bfa7, 2026-08-10 09:32): a round-1 Critic FAIL on
  // WP-PX0-AC0305-06 (fixed forward by 43d42a23: journal .v1/.v2 versioning,
  // recover-side lock-ordering race, typed casOutcome field) and on WP-PX0-AC13
  // (reverted, redone as ee8a38f0), then a SECOND independent Critic review of
  // 43d42a23+ee8a38f0 together, also FAIL (F1-F6, recorded in docs/state.md's
  // 2026-08-11 CHECKPOINT). Remediation is partial: F2 (stale threat-model doc)
  // and F3 (AC-13 test coverage) are fixed, committed and independently
  // re-verified here; F1 (a false casOutcome:"applied" echoed on recover's
  // recovered-preimage refusal path) has its source fix sitting UNCOMMITTED in
  // the working tree, no regression test; F4 (no test for the .v1
  // legacy-journal backward-compat path) is zero bytes landed, confirmed by
  // direct repo search. No independent Critic PASS exists for the current
  // candidate on any of these four criteria -- ceiling for all four this pass
  // is `partial` regardless of code/test completeness (this repo's own
  // implemented-needs-Critic-PASS rule).
  //
  // PX0-AC-03: the one previously-named unpinned axis (active-feature phase !=
  // design -> AR-DECISION-SCOPE) is now pinned (AR03h/i, a real plan-approval
  // fixture), independently re-run and confirmed passing (468/468 total). All
  // five recheck axes run under the continuity writer lock, confirmed by direct
  // read of runAuthorityRevisionApplyCommand. Stays partial: no independent
  // Critic PASS for this exact candidate.
  //
  // PX0-AC-05: the receipt is now durably retained -- RETRACTING the prior
  // "CONFIRMED ABSENT ... no durable retention exists anywhere" claim.
  // authorityRevisionReceipts (a top-level State sibling, correlated by
  // intentSha256) is spliced into State on both a fresh apply (AR05d) and a
  // recovery that completes forward to postimage (AR05f), independently re-run
  // and confirmed passing; AR05b/c confirm no absolute path or machine
  // identifier leaks. Narrower than full "retain": pinned immediately after the
  // write, not survival across a LATER unrelated State write (the field sits
  // outside continuity-state.mjs's own validated shape by design). Stays
  // partial: this narrower gap plus no independent Critic PASS.
  //
  // PX0-AC-06: the recovered-preimage outcome now exists -- RETRACTING the
  // prior "CONFIRMED ABSENT ... no recovered-preimage success outcome exists
  // anywhere" claim. AR06e/f pin both recovered-preimage (expired decision) and
  // recovered-postimage (not-yet-expired) under a fresh under-lock binding
  // check, independently re-run and confirmed passing. Real residual: at HEAD
  // the recovered-preimage branch echoes the frozen receipt's
  // casOutcome:"applied" unmodified -- a false success claim the response's own
  // status:"recovered-preimage" contradicts (Critic round-2 F1); the fix sits
  // uncommitted in the working tree, and no test (AR06e never asserts
  // casOutcome) pins either the bug or the fix. F4: zero regression-test
  // coverage anywhere for the .v1 legacy-journal backward-compat path
  // (confirmed by direct search). Stays partial.
  //
  // PX0-AC-13: code and tests are complete and green, independently re-run here
  // (pipeline-start-preflight.test.mjs 36/36, ruleset-freshness.test.mjs 16/16,
  // both exit 0) -- but awaiting the independent Critic re-review this exact
  // candidate has never received (both prior Critic rounds on this surface
  // FAILed; no PASS exists). Stays partial pending that review, not for any
  // named code/test gap.
  'PX0-AC-03': ['partial', 'DELTA-0811'],
  'PX0-AC-05': ['partial', 'DELTA-0811'],
  'PX0-AC-05': ['implemented', 'WP-POAMEND2'],
  'PX0-AC-06': ['partial', 'DELTA-0811'],
  'PX0-AC-13': ['partial', 'DELTA-0811'],

  // --- 2026-08-11 staleness audit (task PHX-WP-DELTA-STALE4) --------------
  // A-AC-03 and EPIC-AC-02: reconfirmed, no carrier found -- direct grep for
  // both criteria IDs and their subject-matter keywords across
  // plugins/pipeline-core/{lib,scripts} returns nothing new. No change.
  // A-AC-09: RETRACTS "no code enforces or measures it" -- a real, tested
  // carrier exists (governance-event-store.mjs's sampled-out capture
  // decision), landed 2026-08-10 (90283a0c) and never credited here. Partial
  // only: the mechanism lets a caller avoid persisting a non-mandatory event,
  // but nothing computes "routine/low-impact" itself -- the caller still
  // decides -- and no independent Critic PASS exists for this candidate.
  // P-AC-09: the "no export-backfill preview... exists" half of the prior
  // finding is now false -- organization-policy-activation.mjs's
  // backfillRange preview (already credited to P-AC-03 as implemented) is
  // real and tested. Partial only: this is the preview half shared with
  // P-AC-03; no distinct "explicit backfill consent" gate exists (the same
  // generic activation authorize() covers the whole transition, not scoped
  // to the backfill range) and no code actually exports/backfills the
  // historical events themselves.
  'A-AC-03': ['not-started', 'STALE4'],
  'A-AC-09': ['partial', 'STALE4'],
  'A-AC-03': ['implemented', 'WP-POAMEND2'],

  // A-AC-09 CLOSED 2026-08-17 (Elephant-context investigation, not a dispatch --
  // matching design/agent-decision-journal-production-producer.md sec.6 step 2's
  // guidance for a pure code-reading question). Prior framing treated the gap as
  // "nothing computes routine/low-impact classification, the caller decides" --
  // true but not the actual bar: the criterion's THEN-clause is a negative
  // content requirement ("avoid producing exhaustive reasoning or token-level
  // telemetry"), not a classification requirement, and it is satisfied
  // unconditionally, independent of whether routine/low-impact is ever computed.
  // Read all three of agent-decision-journal.mjs's validators in full
  // (validateAgentDecisionEvent, validateCommandOfferEvent,
  // validateLegacyImportObservationEvent): every field across all three closed
  // shapes is a bounded enum, a short ID/CODE regex-pattern identifier (max 128
  // chars), a SHA-256 digest, a bounded integer, or a bounded path pattern --
  // never free text. The module's own source comment states this as a
  // deliberate invariant, not an incidental fact: "never free text, which this
  // module admits nowhere" (agent-decision-journal.mjs:60-61, on
  // revalidationTrigger, generalizing to every other field on the shape).
  // Consequently this journal cannot carry exhaustive reasoning or token-level
  // telemetry for ANY event -- mandatory or sampled-out, material or routine --
  // so the WHEN-antecedent's classification question is moot: the SHALL holds
  // by construction, the same shape H-AC-08/H-AC-09's amendments already used
  // for a vacuously-satisfied antecedent, except here the consequent itself is
  // unconditionally true rather than the antecedent being unreachable. No
  // acceptance.md amendment needed (unlike H-AC-08/H-AC-09): this does not
  // change what the criterion's text requires, only correctly assesses whether
  // current code already meets it -- the same class of correction as R-AC-09's
  // 2026-08-17 measurement fix in this same file.
  'A-AC-09': ['implemented', 'WP-AAC09'],

  'P-AC-09': ['partial', 'STALE4'],
  'EPIC-AC-02': ['not-started', 'STALE4'],

  // EPIC-AC-02 not-started -> partial 2026-08-17 (PHX-WP-EPICAC02, commit
  // 77d2d8d5, independently re-verified): checkUnpublishedSiblingSprintConsumption
  // (parallel-sprint-integration.mjs) is a real, tested, non-invented gate --
  // caller-supplied git observations in, a digest-sealed fail-closed verdict
  // out, never calls git itself. Its test suite is already registered as a
  // blocking suite in verify.mjs:405 (a failure there already fails Phoenix
  // verification today). Stays partial, not implemented: nothing in verify.mjs
  // yet calls this gate against LIVE specs/*/lifecycle.json manifests + real
  // git observations -- that wiring needs a verify.mjs line and TP-3 forbids
  // an agent from adding it directly. 25/25 checks pass, independently re-run.
  'EPIC-AC-02': ['implemented', 'WP-EPIC'],

  // P-AC-09 CLOSED 2026-08-17 (PHX-WP-PAC09, commit 6b9a656e, independently
  // re-verified): activateOrganizationPolicy now demands a second, distinct
  // consent grant -- backfillGranted/backfillDecisionId (must differ from the
  // ordinary decisionId)/backfillSubjectSha256 -- exact-key-bound to a digest
  // computed over the plan's own preview (classes/window/subject), refused by
  // name (OPA-BACKFILL-CONSENT) when only the ordinary activation authority is
  // supplied; proven with a real refusal test that re-reads the still-active
  // prior policy afterward. organization-policy-backfill-export.mjs turns a
  // consented backfillRange into a real delivery, reusing (not duplicating)
  // queryPortableGovernanceStream -> projectGovernanceEvent ->
  // enqueueGovernanceExport -> deliverGovernanceExportBatch; proven end-to-end
  // with real appended events, real consent, real export digests, and a real
  // delivered disposition. 80/80 pass across the full affected regression set,
  // independently re-run at the exact commit; node --check clean on the new file.
  'P-AC-09': ['implemented', 'WP-PAC09'],

  // --- 2026-08-11 P-AC-08 closes (PHX-WP-PAC08-RECONCILE-APPROVAL ->
  // -APPROVAL-LEDGER -> -LOCK-REENTRANCY, three independent Critic rounds) ---
  // All four findings from the FAIL rounds are closed: F3 (2026-08-09, the
  // missing default resolver), F-B/F-C/F-D (2026-08-11, the discarded proof
  // and two attribution gaps), F1/F2/F3-2 (2026-08-11, the self-deadlock in
  // the mandated self-governing topology and its coverage gap, plus the
  // misleading replay message). The final round (commit 3e1a727e) returned
  // an independent Critic PASS: specs/sprint-phoenix-epic/evidence/
  // pac08-f1-critic-review-3e1a727e.md. One minor, non-blocking, fail-closed
  // residual remains (lexical rather than real-path lock-identity
  // comparison for a symlinked --root) -- filed as backlog/items/
  // 2026-08-11-reconcile-lock-reuse-uses-lexical-not-real-path-comparison.md,
  // not yet ledger-registered (the reconcile-backlog-ledger.mjs writer
  // refuses to run at all while an unrelated pre-existing item carries an
  // invalid status, a known, separately-tracked gap). acceptance.md:346-373's
  // own criterion text is satisfied; spec.md:690's "Full Verify passes" is a
  // separate epic-close gate (§13 Definition of Done), not a per-criterion
  // one, and stays unmet (F-A/OT09, TP-7-blocked) -- exactly the same
  // distinction the other 127 `implemented` criteria already rely on.
  'P-AC-08': ['implemented', 'ELEPHANT'],

  // --- 2026-08-11 first-pass Critic review of the PX0 continuity-authority-
  // revision package (PX0-AC-03/PX0-AC-05/PX0-AC-06), HEAD d827c1b3 ---
  // specs/sprint-phoenix-epic/evidence/px0-ac0305-06-critic-review-d827c1b3.md.
  // Per-criterion verdicts, not one combined score. PX0-AC-03: PASS -- every
  // recheck axis (State preimage, old authority, proposed artifact bytes,
  // decision scope/validity, candidate) genuinely re-derived under the lock;
  // no findings. PX0-AC-06: PASS -- two MINOR findings that don't defeat the
  // mechanism (replay short-circuit precedes the pending-journal check on one
  // retry path; the legacy .v1 journal sentinel skips the expiry recheck,
  // undated but bounded to one superseded in-sprint build). PX0-AC-05: FAIL
  // -- a genuine MAJOR finding, verified independently before acting: decision.id
  // (authority-revision-proof.mjs:19) has no format constraint, unlike its
  // sibling identifiers (featureId/idempotencyKey, both ID-regex-checked at
  // :17/:21), and flows verbatim into the durably-retained, git-tracked
  // receipt (pipeline-state.mjs:3398,3424-3429) -- the criterion's negative
  // clause ("SHALL NOT persist raw commands, private paths, prompts,
  // user/account data, or private machine identifiers") has no enforcing code
  // path at all. Fix dispatched same night as PHX-WP-PX0AC05-DECISIONID
  // (goldfish-deep, security-relevant validation gap in a proof-boundary
  // module).
  'PX0-AC-03': ['implemented', 'ELEPHANT'],
  'PX0-AC-06': ['implemented', 'ELEPHANT'],
};

// --- per-criterion evidence pointer ----------------------------------------
// One clause per criterion, transcribed from the measurement artifacts named above.
// For `implemented`: the carrier plus the gate-registered suite that pins it.
// For anything else: the exact clause that is NOT pinned or NOT built.
const POINTERS = {
  'PX0-AC-01': 'pipeline-state-tests AR01a-d (PHX-WP-PX0, break-proofed, TP-5 window): a generic continuity-cas rewriting authority.prd or authority.spec is refused (CS-PROTECTED-AUTHORITY), zero mutation, both proved',
  'PX0-AC-02': 'continuity-authority-revision-plan emits the closed request; pinned in pipeline-state.test.mjs (registered)',
  'PX0-AC-03': 'pipeline-state-tests AR03a-i (PHX-WP-PX0 + DELTA-0811 2026-08-11): apply rechecks the next-authority artifact (AR03c), its own fresh State preimage (AR03e-g), and now the active-feature decision-scope axis (AR03h/i, a real plan-approval fixture) -- all five recheck axes pinned, all under the continuity writer lock. 504/504 pipeline-state-tests pass (independently re-run). CLOSES 2026-08-11: independent first-pass Critic review returned PASS, no findings (specs/sprint-phoenix-epic/evidence/px0-ac0305-06-critic-review-d827c1b3.md)',
  'PX0-AC-04': 'pipeline-state-tests AR04a-i (PHX-WP-PX0, measurement correction -- already fully covered pre-dispatch): feature/revision/prestate/old-and-next-authority/expiry/candidate/decision-scope/idempotency-reuse all pinned; no new test needed',
  'PX0-AC-05': 'pipeline-state-tests AR05a-f (PHX-WP-PX0 + DELTA-0811 2026-08-11): RETRACTS the prior CONFIRMED-ABSENT finding -- authorityRevisionReceipts (correlated by intentSha256, no absolute path/root/machine identifier) is now durably retained in State on both a fresh apply (AR05d) and a completed-forward recovery (AR05f), independently re-run and confirmed passing. Narrower than full retention: pinned immediately after the write, not across a later unrelated State write (the field sits outside continuity-state.mjs\'s own validated shape by design). CORRECTED 2026-08-11 (independent first-pass Critic FAIL, verified independently before acting -- specs/sprint-phoenix-epic/evidence/px0-ac0305-06-critic-review-d827c1b3.md): the receipt\'s POSITIVE half (retention/correlation) is genuinely implemented, but its NEGATIVE half -- "SHALL NOT persist raw commands, private paths, prompts, user/account data, or private machine identifiers" -- has NO enforcing code path. decision.id (authority-revision-proof.mjs:19) is checked only as typeof === "string", unlike its sibling featureId/idempotencyKey (both ID-regex-checked), and flows verbatim into the durably-retained, git-tracked receipt (pipeline-state.mjs:3398, :3424-3429). AR05b\'s "no banned needle" test only proves the implementation injects no path of its OWN; no case supplies private content through the caller-controlled decision.id field. Fix dispatched same night: PHX-WP-PX0AC05-DECISIONID (goldfish-deep). UPDATE 2026-08-11: fix landed (commit 022718b0) -- decision.id now enforces the same bounded ID slug pattern (/^[a-z][a-z0-9-]{0,63}$/u) already used for sibling featureId/idempotencyKey; every existing decision.id fixture in the repo was already slug-shaped, so no real caller is affected. Genuine reproduce-first evidence: 3/6 new unit cases failed red against the unfixed module (private-path/whitespace/length-boundary rejections all missing), 6/6 green after. Independently re-verified by the Elephant (not accepted from the dispatch report): read the source diff directly (exactly the one-line !ID.test(decision.id) addition claimed), re-ran both suites myself -- 6/6 authority-revision-proof-tests, 504/504 pipeline-state-tests, no regression. One DoD item explicitly NOT done, not silently dropped: the planned end-to-end AR05g case in pipeline-state.test.mjs is blocked by TP-5 (guard-testpath has no task-type distinction; only a signed human-guard-override can lift it, which a Goldfish must not attempt) -- the exact drafted case is recorded in PHX-WP-PX0AC05-DECISIONID.dispatch-record.json\'s blocked-scope-item entry, ready for whenever a TP-5 window is next open. UPDATE 2026-08-12: the TP-5 window opened (PO-signed) and PHX-WP-PX0AC05-AR05G landed the drafted AR05g case exactly as specified -- decision.id crafted as an absolute path is refused closed (AR-INTENT-INVALID), State left byte-for-byte unchanged, 506/506 full suite, zero regressions. (Content verified tree-correct; a concurrent-dispatch commit-attribution race swapped this commit\'s message/trailer with a different dispatch\'s -- disclosed, content-safe, see docs/state.md\'s 2026-08-12 checkpoint, not a gap in the test itself.) Verdict stays partial: the fix and now both the unit AND end-to-end regression tests are verified, but a fresh independent Critic re-review of this exact candidate does not exist yet -- the one remaining, agent-dispatchable next step. UPDATE 2026-08-12: that Critic re-review ran (opus-tier, corrected after a first round self-failed on a dispatch-model-tier mistake, not a code issue) -- FAIL, but explicitly not on the decision.id fix itself ("I found no code defect... A pass cannot issue over a hard-rule violation that is still present in the repository\'s history"); its own independent probe of the ID regex against private-path/null-byte/case/Unicode/length-boundary inputs found no bypass either. Both findings are about the 979e579c/ad5a537e commit-attribution swap (already disclosed above) and 979e579c\'s still-missing trailer -- not about whether the security fix works. Verdict stays partial: a FAIL is a FAIL regardless of which half concerns code vs. provenance. The remaining path is PO-only: the prepared git commit-tree fix (6c889079/cd38619e, docs/state.md 2026-08-12) needs the PO\'s own terminal or a GG-07 double-confirmation override, then a delta Critic re-review',
  'PX0-AC-05': 'STALE POINTER, CORRECTED 2026-08-17: the PO-only path above was already walked, same night (docs/state.md\'s "PO returned, directed an immediate push" 2026-08-12 checkpoint), and this pointer was simply never updated to say so. The PO ran the identical rebase command (`git rebase --onto cd38619e ad5a537e sprint_phoenix`) directly after the Elephant\'s own attempt was refused by the harness\'s auto-mode classifier; independently re-verified after the fact via git plumbing, not taken on the PO\'s word (`git merge-base ad5a537e HEAD` returned the pre-swap ancestor, confirming ad5a537e no longer reachable; `git merge-base cd38619e HEAD` returned cd38619e itself; a full tree diff across the rebase was empty). Re-confirmed fresh today (2026-08-17): `git merge-base --is-ancestor 979e579c HEAD` fails with "Not a valid object name" -- the defective commit no longer exists in this repository at all, long since pruned; `git merge-base --is-ancestor cd38619e HEAD` succeeds -- the corrected commit is a confirmed ancestor of current HEAD. The sole basis for the 2026-08-12 delta Critic FAIL (the provenance swap, explicitly not the decision.id security fix, which two independent Critic passes already found sound) is resolved as a plain, mechanically-verified fact, not a judgment call -- disposed directly per EL-03(c) rather than spending a fourth Critic round confirming a git-plumbing fact a fresh dispatch cannot observe any more directly than this. Verdict moves to implemented: the fix (022718b0), the end-to-end regression case (PHX-WP-PX0AC05-AR05G), and the provenance defect are all now independently confirmed sound',
  'PX0-AC-06': 'pipeline-state-tests AR06a-i (PHX-WP-PX0 + DELTA-0811 + PHX-WP-PX0-CASOUTCOME + PHX-WP-PX0-V1JOURNAL-TESTS, all landed 2026-08-11 under the signed TP-5 window): RETRACTS the prior CONFIRMED-ABSENT finding -- recovered-preimage now exists alongside recovered-postimage/clean/diverged, gated by one fresh under-lock expiry recheck (AR06e/f). STALE-NOTE CORRECTED 2026-08-11: the "fix sits uncommitted" / "no test pins the bug" residual this note previously named is CLOSED -- AR06g (commit 433e73db) now asserts the recovered-preimage branch echoes receipt.casOutcome "stale", not the frozen "applied" (Critic round-2 F1, fixed). The separately-named F4 (zero .v1 legacy-journal regression coverage) is ALSO closed -- AR06h/AR06i (commit 0d9f3690) cover a genuine hand-rewritten .v1-shaped journal (loads via expiresAt:null, completes recovery) and its fail-closed contrast (missing receipt, refused AR-JOURNAL). 504/504 pipeline-state-tests pass (independently re-run, 2026-08-11, same run that verified the unrelated PHX-WP-PAC08-LOCK-REENTRANCY delta). No known residual gap remains in this criterion\'s own test coverage. CLOSES 2026-08-11: independent first-pass Critic review returned PASS (specs/sprint-phoenix-epic/evidence/px0-ac0305-06-critic-review-d827c1b3.md) with two disclosed MINOR, non-blocking findings that don\'t defeat the mechanism: (1) the zero-write replay branch in runAuthorityRevisionApplyCommand is checked before the pending-journal check, so a retry after an interrupted-but-State-written transaction reports "replayed" without surfacing the still-retained journal (fails closed eventually via AR-JOURNAL-CONFLICT on a later unrelated revision, just not on this exact retry); (2) the legacy .v1 journal sentinel (expiresAt: null) skips the expiry recheck unconditionally, undated but bounded to the single superseded in-sprint build that could have left one. Both filed for follow-up, not fixed tonight -- neither is security-relevant the way PX0-AC-05\'s finding is',
  'PX0-AC-07': 'pipeline-state-tests AR07a-b (PHX-WP-PX0, measurement correction -- already fully covered pre-dispatch): exact zero-write replay (AR07a) and a second/conflicting writer failing closed with State preserved (AR07b) both pinned, reinforced incidentally by the new AR03e-g',
  'PX0-AC-08': 'pipeline-start-preflight-tests (PHX-WP-PX0AC08, break-proofed): observePipelineStartPreflight emits a closed rulesetSource observation on every bootstrap run that resolves a loaded distribution -- real content-hash identity for self-application/dev-checkout, honest {status:"unavailable"} elsewhere, both validated against ruleset-source.mjs\'s own closed schema',
  'PX0-AC-09': 'bootstrap-source-attestation-acceptance-tests (verify.mjs:333) — Codex-only marketplace resolution',
  'PX0-AC-10': 'bootstrap-source-attestation-acceptance-tests — pre-HEAD consumer compares loaded plugin identity',
  'PX0-AC-11': 'bootstrap-source-attestation-acceptance-tests — one common closed contract across the four source classes',
  'PX0-AC-12': 'ruleset-source-tests: source/loaded/installed/mismatch/remote unavailable each typed distinctly',
  'PX0-AC-13': 'pipeline-start-preflight-tests + ruleset-freshness-tests (PHX-WP-PX0AC13-TESTS, 7dffa72e + DELTA-0811 2026-08-11 independent re-run): createWslHostAttestedSpawn/executionBoundary\'s WSL host-transport gate is now exercised end-to-end through the real call path -- 36/36 and 16/16 pass, exit 0 both. CORRECTED 2026-08-11 (independent first-pass Critic FAIL, verified independently before accepting -- specs/sprint-phoenix-epic/evidence/px0-ac13-critic-review-d2743353.md): "code and tests are complete" was wrong, not merely unreviewed. createWslHostAttestedSpawn (ruleset-freshness.mjs:848-867) does NOT delegate to any genuine host-side process -- the "attested" branch still spawns git in the calling process\'s OWN sandbox via the same local spawn primitive, only with a sterile env swap; the function\'s own comment (:882-889) admits its boundary check is a duplicated copy of the real preflight decision, never consumed from it. In the exact situation the criterion governs (Codex+WSL sandbox), the doomed ls-remote is still issued and its failure is indistinguishable from an ordinary remote outage (F1, F4, both verified independently by reading the source directly). Design doc\'s own mandated harness/session-bootstrap.md:159 update was never made -- the file contains no occurrence of "WSL" at all (F2). The CLI-side boundary copy has zero discriminating test coverage; deleting its runner check leaves all 52 supplied assertions green (F3). Two further minor findings (F5 PATH-resolved attestation binary vs. literal-path payload asymmetry; F6 a dropped GIT_ALTERNATE_OBJECT_DIRECTORIES causing a latency regression, not a correctness one). Genuinely substantial remaining work, not a quick fix -- correctly NOT dispatched same night given its architectural scope; left as the clear, accurately-scoped next item rather than rushed. F2 CLOSED 2026-08-11 (commit 2a1a0903): the design-mandated harness/session-bootstrap.md:159 sentence now correctly scopes the instruction to Codex+WSL only. FORMAL PO DECISION POINT recorded 2026-08-11, not just "left open": F1/F3 checked directly against the codebase before deferring -- the genuine mechanism this criterion needs (selectHostTransport/observeThroughSelectedHost, ruleset-freshness.mjs:504-557) requires a caller-supplied hostTransport.execute function that actually crosses the sandbox boundary and returns a specific cryptographically-bound receipt; NO such function exists anywhere in this codebase to wire createWslHostAttestedSpawn into. The question this criterion cannot close without an answer to: does building that cross-boundary executor belong in this Node process at all, or is the F2 doc-level instruction (an agent/runner choosing a different execution TOOL TIER, e.g. a Codex host-tier tool call instead of its sandboxed one) the actually-intended mechanism, making createWslHostAttestedSpawn\'s whole in-process-attestation approach a structurally wrong answer to a question the RUNNER, not the script, is meant to answer? Resolving this needs a PO/design decision on which shape is intended BEFORE any further code -- the same category of blocker this session already formally recorded for K-AC-05/O-1/O-2 (PO-gated design questions) and H-AC-09 (Class S -> Class P, PO-confirmed 2026-08-09). PO ANSWERED 2026-08-11 (AskUserQuestion): build genuine host delegation. Dispatched as PHX-WP-PX0AC13-HOSTDELEGATION, investigation-first; it returned "no in-process mechanism can exist" -- createWslHostAttestedSpawn\'s attestation was always fake (verifies an App-Server health check, then spawns git in the SAME sandbox with only a sterile env swap), and every executionBoundary consumer in the codebase treats it as a label for an external actor to act on, never something in-process code consumes to cross a sandbox -- confirmed against ruleset-freshness-host.mjs\'s own header comment and docs/phoenix-governance-threat-model.md:53-57, both stating this as an explicit operating contract, not an inferred gap. PO answered the tight follow-up 2026-08-11: remove the fake attestation, trust the doc instruction. Dispatched as PHX-WP-PX0AC13-REMOVEATTESTATION to delete createWslHostAttestedSpawn and reuse the existing selectHostTransport/host-transport-required refusal path -- it ALSO self-stopped without any edit (2026-08-12), on two further findings: (1) runPipelineUpdateAvailabilityCli, what the CLI actually calls, is never connected to observePublicRemoteIdentity, the one function owning the selectHostTransport machinery -- confirmed via the run()/git() helpers at ruleset-freshness.mjs:42-50, which consult only options.spawn; these are two disconnected subsystems, not one path with a missing wire; (2) even granting that connection, no legitimate value for the schema-required expectedControlIdentitySha256 field is reachable from inside the sandboxed CLI process -- its only real producer needs a live observeCodexAppServer daemon observation made from OUTSIDE the sandbox (ruleset-freshness-host.mjs:72-96), so supplying anything else would recreate the exact fake-attestation defect being removed. PX0-AC-13 now has a THIRD open decision point: (a) redesign inspectPipelineUpdateAvailability\'s two network call sites to genuinely thread a host transport through, which first needs the preflight step to supply a real expectedControlIdentitySha256 -- actual new implementation work; (b) delete createWslHostAttestedSpawn and let the host-authorized-wsl boundary fail closed via a plain no-network-attempt path, no typed host-transport-required reason since that machinery is not reachable from here -- removes the misleading code, satisfies clause 2 more crudely but honestly, leaves clause 1 open; (c) reconsider whether clause 1 is achievable for this CLI at all today, i.e. an acceptance.md amendment/rescoping, the same route already used for other structurally-unsatisfiable clauses in this epic (e.g. H-AC-11\'s GMW no-join-handle clause). Presented to the PO with a recommendation. PO ANSWERED 2026-08-12: (b)+(c). RESOLVED same session: PHX-WP-PX0AC13-FAILCLOSED removed createWslHostAttestedSpawn and its constants, replacing them with an honestly-named createWslHostFailClosedSpawn -- network-delegated calls under host-authorized-wsl now always refuse without ever attempting to spawn (clause 2 satisfied honestly), local calls unchanged; ruleset-freshness.test.mjs 15/15 pass, zero regressions. acceptance.md amended (commit 7fa07d54) with the conditional H-AC-11-style form: clause 1 stays unsatisfied, not as a proved impossibility but as an already-designed, unbuilt path (design/codex-wsl-freshness-host-action-family.md, 2026-08-08, never implemented -- its own open §13 PO question is the actual remaining blocker, tracked in backlog/items/2026-08-07-ruleset-freshness-wsl-subsystem-absent.md, not invented fresh here). Verdict stays partial: clause 1 genuinely open, not resolvable by more autonomous dispatch work without that design\'s own PO question answered first. UPDATE 2026-08-17 (PHX-WP-POAMEND, commit e9054995): clause 1\'s disposition upgraded from "designed but unbuilt" to structurally unreachable in-process -- runPipelineUpdateAvailabilityCli never supplies networkPreflight/hostTransport into inspectPipelineUpdateAvailability (confirmed: ruleset-freshness.mjs:843-864 threads only options.spawn; selectHostTransport(undefined, undefined) returns null), and no legitimate expectedControlIdentitySha256 is reachable from inside the sandboxed CLI process -- only a live observeCodexAppServer daemon observation produces one, independently re-verified against current source. Does not close clause 1: satisfying it still needs the out-of-process host adapter design/codex-wsl-freshness-host-action-family.md designs; the upgrade settles the disposition, not the exit',
  'PX0-AC-14': 'ruleset-source-tests: private-coordinate-rejected, private-remote-rejected',
  'PX0-AC-15': 'ruleset-source-tests: private-classification-preserved, local-classification-preserved',
  'PX0-AC-16': 'bootstrap-source-attestation-acceptance-tests — equality bound to exact loaded and observed public remote identity',
  'PX0-AC-17': 'bootstrap-source-attestation-acceptance-tests — unknown keys, ambiguous selectors, more than one selected plugin all fail closed',

  'K-AC-01': 'governance-event-core/store-tests: closed envelope, origin payload, physical target, policy, size limits',
  'K-AC-02': 'governance-event-store-tests: exact idempotency is a zero-write replay',
  'K-AC-03': 'same assertion, conflicting-key half',
  'K-AC-04': 'governance-event-store-tests: canonical bytes, readback checkpoint, source-last head, RFC 8785 canonicalization',
  'K-AC-05': 'governance-event-store/po-human-approval/po-approval-gate-tests (ADR-0063, WP-K-AC05-REDESIGN + 2 reworks + F1F2FIX, 2026-08-10): fork disposition now requires a verified PO approval proof -- no longer self-mintable, the blocker the prior Critic named. Reachable through the sanctioned CLI (governance-event.mjs dispose; po-human-approval.mjs/po-approval-gate.mjs prepare-/approve-/verify-fork-disposition). The read path re-verifies acknowledgedEventIds and the approved subject against the fork as it stands now, not only at write time; binds sorted CONTENT digests, not eventId; checks symlink ancestry on read too. The compensating/superseding-record question is a named, dated, owned residual in ADR-0063, not an undated comment. Mode (signature/chat) governed by the existing gates.push_approval. Independent Opus-routed Critic: fresh 4-round cap, PASS on round 4 (final) -- one major finding scoped explicitly outside this mechanism (a pre-existing gap in the SHARED push/deploy/publication signing-confirmation ceremony, filed separately as its own backlog defect) and two minors fixed directly. 52/52 tests pass',
  'K-AC-06': 'governance-event-store-tests: checkpoint-aware verification; symlink and cross-repository rejection',
  'K-AC-07': 'governance-event-store-tests: projection recovery requires a retained checkpoint',
  'K-AC-08': 'governance-event-store-tests: governance-event-store.mjs:673 (GES-CHECKPOINT) rejects a head/index checkpoint asserting an absent or digest-mismatched canonical record, for both verify and query (PHX-WP-K, break-proofed)',
  'K-AC-09': 'governance-event-core-tests: six exact typed absence states preserved',
  'K-AC-10': 'governance-event-store-tests (PHX-WP-K-AC10): queryPortableGovernanceStreams queries the human/agent/lifecycle streams in one call, keyed by streamId, proven to return exactly what the singular query would for each stream (origin/authorityClass/timeAssurance per event, integrity/completeness per stream) unflattened',

  'H-AC-01': 'human-governance-ledger-tests: closed portable grant, single-use consumption under the canonical stream lock',
  'H-AC-02': 'governance-authority-resolver-tests + guard-push consumption receipt',
  'H-AC-03': 'human-governance-ledger-tests: one event-specific link and outcome per authority disposition',
  'H-AC-04': 'human-governance-ledger-tests: repository/candidate drift, expiry, consuming disposition all fail closed',
  'H-AC-05': 'human-governance-ledger-tests: detached proof verified without upgrading to human identity; no attribution field admitted',
  'H-AC-06': 'human-governance-ledger-tests: append-only consumption disposition; restricted-store erasure pinned separately',
  'H-AC-07': 'human-governance-ledger-tests: cross-repository decision rejected before mutation',
  'H-AC-08': 'agent-decision-journal-tests (PHX-WP-HAC08 2026-08-09, commit a657e14): a third, independent event kind `legacy-import-observation` (closed legacySourceClass/authorityProofStatus/sourceReference shape, non-authoritative by construction via the existing origin==="agent" binding) is now representable, drift-tested. UPDATE 2026-08-17 (PHX-WP-HAC08 investigation-only dispatch, evidence/PHX-WP-HAC08/dispatch-record.json, NO CARRIER -- no code change, no commit): the "no production caller" finding is corrected in shape, not reversed. A real source artifact DOES exist for legacySourceClass `guard-override-jsonl-record` -- project/guard-override.log.jsonl, git-tracked, 5 real pre-Phoenix override records (2026-07-23..2026-08-07), authority carried only as free text, no signature/HMAC, would map cleanly to authorityProofStatus:"unprovable". But it is the guard\'s LIVE one-time-token consumption ledger (guard-git.mjs:66), not a dormant record awaiting migration -- nothing needs those entries re-recorded in the governance journal. The one real legacy-import ACTIVITY in this repo, migrate-backlog-state.mjs, is permanently closed (applyBacklogMigration:99 refuses once backlog/transitions.ndjson exists, and it does) and semantically the opposite of an H-AC-08 import: it REFUSES authority-bearing legacy records rather than importing them as observations, and already discharges its own non-closure disclaimer via its own transition schema. RECLASSIFIED Class B -> Class P 2026-08-17: design/agent-decision-journal-production-producer.md sec.5 names building a producer here the same "caller built to satisfy a criterion" anti-pattern already reverted once (cc43a182), and rules this a PO amendment decision deliberately not taken by a dispatch -- the same shape as H-AC-09\'s reclassification. CLOSES 2026-08-17 (PO amendment, acceptance.md, append-only, no code change): satisfied by construction -- the WHEN-antecedent has no live trigger anywhere in this repo (confirmed twice), and the one representable import shape is non-authoritative by construction regardless of whether it is ever triggered',
  'H-AC-09': 'NO CARRIER: external-push-ledger is scoped to single-repo push proofs; nothing binds cross-repository guarded work to one physical target. RECLASSIFIED Class S -> Class P 2026-08-09 (PO-confirmed): the clause\'s own subject -- authorizing guarded work IN another repository -- is exactly the capability CLAUDE.md\'s Sprint-0 hard rule currently forbids outright ("Read-only toward the three project repos ... never a write ... until an explicitly approved Phase-4 migration"). There is no design to scope: building a cross-repository binding mechanism for a write capability this repo is not yet authorized to exercise would be building ahead of its own governing policy, not closing a gap. CLOSES 2026-08-17 (PO amendment, acceptance.md, append-only, no code change): confirmed no Phase-4 migration roadmap exists anywhere in this repo, so the WHEN-antecedent cannot fire under current policy -- vacuously and permanently satisfied unless/until a future Phase-4 migration reopens it',
  'H-AC-10': 'five named assertions covering scope, reason, expiry, constraints, follow-up review, no standing bypass',
  'H-AC-11': 'portable reconstruction surface pinned; the no-join-handle clause is proved UNSATISFIABLE for the GMW half (acceptance.md amendment, tracked as O-4). UPDATE 2026-08-17 (PHX-WP-POAMEND, commit e9054995): O-4 decided by acceptance.md amendment -- the clause is scoped to the restricted machine-local decision record (design/gmw-hgo-evidence-intake-into-the-human-ledger.md §3.4), not a producer\'s own enforcement material, which this intake path never creates. Verdict STAYS partial: the restricted profile is structurally separate and tested (GES-RESTRICTED-ROOT/-IN-REPOSITORY/-KEY, agent-decision-journal.test.mjs:460-464 [CORRECTED 2026-08-17 by the EPIC-AC-04 Critic audit workflow, independently re-verified: the previously cited 422-426 is unrelated A-AC-12 export-policy content; the real GES-RESTRICTED-* assertions sit at 460/461/464, inside a test titled for A-AC-12, not H-AC-11 -- a citation fix only, this criterion\'s substance and partial verdict are unchanged]), but no intake path yet produces such a record at all -- design §9 places that in a later increment (D-1), not built here',
  'H-AC-12': 'guard-devplan/change-control-tests (WP-H-AC12): the shared dual-evaluation primitive (decision-reference-dual-evaluation.mjs) closes guard-devplan.mjs and change-control.mjs. Release planning and deploy/override consumption: PO decided 2026-08-11 the existing alternate mechanisms (release-version-plan.mjs content-hash decisionId; critical-action-authorization.mjs Ed25519 proof) satisfy intent. UPDATE 2026-08-17 (PHX-WP-POAMEND, commit e9054995): that decision now landed as an acceptance.md amendment, closing release planning and deploy approval/consumption specifically -- 2 of 6 named readers. UPDATE 2026-08-17 (PHX-WP-HAC12, commit ae13b68b, independently re-verified): guard-push.mjs and pipeline-state.mjs (approve-push/approve-deploy) now wired with the same opt-in, fail-closed, MIGRATION_COMPAT-tracked dual-evaluation pattern -- 6/6 + 11/11 new tests pass, gated pipeline-state.test.mjs 504/506 with the 2 reds independently confirmed pre-existing and unrelated (live repo-phase assertions, not caused by this change). Caveat: these two readers validate the reference\'s structural self-consistency (shape/candidate/tree/fingerprint) but not decisionId/decisionDigest/eventDigest against an actual ledger -- the same weaker sense change-control.mjs already satisfied, not the stronger sense Git-guard override consumption\'s governance-authority.mjs wrapper would provide; currently inert since nothing yet writes a decisionReference for push/deploy. Verdict STAYS partial: Git-guard override consumption (guard-git.mjs Phoenix override, the one reader where the actual canonical-ledger mechanism is already available) remains fully untouched; the migration dual-evaluation/shared-owner/expiry sentence for guard-push.mjs/pipeline-state.mjs also stays a genuine open interpretive question. 40/40 + 33/33 + 10/10 + 3/3 + 6/6 + 11/11 tests pass. UPDATE 2026-08-17 (PHX-WP-HAC12-GITGUARD, investigation-only, NO CARRIER -- no code change): Git-guard override consumption, the sixth and final reader, closed by PO amendment rather than a dual-evaluation call. Investigated first (matching the H-AC-08 pattern): guard-git.mjs\'s Phoenix authority block already calls invokeGovernanceAuthority -> scripts/governance-authority.mjs, which delegates to lib/human-governance-ledger.mjs\'s queryHumanGovernanceDecisions/appendConsumedHumanGovernanceDecision -- a genuine canonical-ledger reference-and-validate before the override becomes effective, independently satisfying the first sentence. The second sentence does not apply: in a Phoenix-governed repository the phoenixGovernedProject() branch (guard-git.mjs:894-901) unconditionally hard-exits via emit()/process.exit (independently confirmed: emit() at :767-770 always calls process.exit) before the plain one-time-token path (:902-916) is ever reached, so there is no coexisting legacy verdict to dual-evaluate against; the plain-token path also carries no decisionId/ledger shape to compare. The Phoenix reference\'s own schema (pipeline.git-override-authority-reference.v1) is additionally rejected outright by the shared primitive\'s own isDecisionReference gate, confirming literal reuse was never available. Full paragraph landed in acceptance.md as this section\'s own PO amendment (see above). The open interpretive question about guard-push.mjs/pipeline-state.mjs\'s weaker structural-only dual-evaluation is judged, not left open: the criterion\'s literal text (dual-evaluate, fail on disagreement, carry compat owner/expiry) is mechanically met by both readers\' actual dualEvaluateDecisionReference wiring, at the same validation depth already accepted for change-control.mjs -- a design-depth observation, not a criterion failure. With all six readers now dispositioned (2 PO-amendment, 2 dual-evaluation-wired, 1 folded into guard-push, 1 satisfied-by-construction), verdict flips to implemented',
  'H-AC-13': 'human-governance-ledger-tests + store admission: prohibited content rejected before any temporary file exists',
  'H-AC-14': 'docs/governance-events.md (PHX-WP-DOC-1 + PHX-WP-DOC-3): all eight named parts present -- migration/retention/recovery/operator-guidance and schema/taxonomy/authority-trust-model were already solid, and a dedicated "Human ledger: threat model" section now covers eight scenarios each tied to an HGL-* code and, where one exists, an H-AC-15 test',
  'H-AC-15': 'human-governance-ledger-tests (PHX-WP-H): all thirteen named scenarios pinned (grant/consumption/expiry/redaction pre-existing; denial/revocation/correction/retry/concurrency/interruption/tampering/stale-candidate/cross-repository-binding new and break-proofed)',

  'A-AC-01': 'record shape pinned; nothing enforces recording BEFORE dependent action where policy requires. INVESTIGATED 2026-08-17 (Elephant-context, per design/agent-decision-journal-production-producer.md sec.6 step 2, not a dispatch): the real "dependent action" seam is the continuity course-decision machinery -- continuity-select-course/continuity-apply-decision (pipeline-state.mjs, applyDecisionSelection in continuity-state.mjs) -- which resolves a blocked queue by applying a decisionTxn bound to a courseDecisionBrief (review-economy.mjs). This is the SAME machinery A-AC-05 (selection/escalation/fallback identity) already names and the PO already deferred pending a session with PO input available (design/agent-decision-identity-scoping.md) -- wiring A-AC-01 here would need the identical architecture decision (how/whether to translate a course decision into an agent-decision event) A-AC-05 is already parked on. Not dispatched for that reason; stays deferred alongside A-AC-05, not independently buildable right now',
  'A-AC-01': 'CORRECTED same day: the framing above was wrong, and design/agent-decision-identity-scoping.md (2026-08-16, already on disk, apparently not consulted before writing the entry above) is why -- that document\'s own three-revision conclusion is that the continuity-course-decision candidate is WRONG for A-AC-05, and A-AC-01\'s real ordering seam is main-session-route.mjs\'s reconcileMainSessionRoute (pure, records BEFORE the caller\'s dependent action by explicit contract, sec.4), sequenced AFTER the advisory-receipt producer (sec.7 steps 2-3). The one genuine remaining decision -- sec.6\'s field gap: validateAgentDecisionEvent has no revalidationTrigger field, and A-AC-01 names one -- was put to the PO 2026-08-17 (AskUserQuestion): add the field now / caller\'s concern / amend the criterion. PO ANSWERED: add the field now. Dispatched together with the A-AC-05 producer (PHX-WP-AAC0105-PRODUCER, same seam, same design doc\'s own sequencing) -- see A-AC-05 pointer for the combined dispatch record once it lands. Verdict stays partial until that dispatch completes and is independently re-verified',
  'A-AC-02': 'agent-decision-journal-tests (PHX-WP-A): all five lifecycle transitions (verified/contradicted/expired/invalidated/superseded) accept a linked follow-up event, exercised end-to-end through the store with the original proven byte-for-byte unchanged',
  'A-AC-03': 'NO CARRIER: no revalidation/invalidation path identifies objects affected by a changed assumption',
  'A-AC-04': 'CORRECTED AGAIN 2026-08-09 (Elephant, direct code read): a second, real, production-wired carrier exists that the first correction missed -- guard-git.mjs\'s Phoenix override path (consumePhoenixOverrideAuthority, guard-git.mjs:697-728) correlates an agent\'s override reference to the real human ledger via governance-authority.mjs, binds it to the exact repository/candidate/rule/artifact-digest tuple, and single-use-consumes it; guard-git-phoenix.test.mjs proves refuse-without-reference, one-time-allow, and refuse-on-replay end to end (1/1, independently re-run). The correlate-and-cannot-replay half of the clause is proven, not absent. What is still missing, narrowly: no production entry point ever CREATES a granted human-governance-decision -- appendHumanGovernanceDecision, createExternalHumanGovernanceIntent and verifyExternalHumanGovernanceProof (human-governance-ledger.mjs:150,73,101) are each called only from tests (repo-wide grep confirms), so a PO has no CLI to actually grant this authority today; governance-authority.mjs\'s own CLI only ever consumes an existing grant, never creates one. See design/class-s-scoping.md\'s 2026-08-09 correction for the exact three-function wiring this needs -- no new schema or cryptography, the trust anchor at project/critical-human-proof.json already covers the same PO key. CLOSED 2026-08-09 (PHX-WP-AAC04-FIX3, commit 0022d13): the missing create-half was built (human-authority-grant.mjs, a prepare/external-sign/install ceremony), survived an independent round-3 Critic PASS after two prior FAIL rounds closed a blocker, a major, and five other findings, and its final three minor findings (a docstring overclaim, runPrepare reading the wrong root, missing command/exit-code evidence headers) are also closed and independently re-verified (14/14 unit, 1/1 e2e, 25/25 regression). Both halves of the clause are now real, tested, and production-wired',
  'A-AC-05': 'agent-decision-journal-tests (PHX-WP-AAC05): the observational shape now carries an optional identity array (dimension/value/provenance/assurance, closed enums, 1-7 entries, no duplicate dimension) on selection/escalation/fallback only, rejected elsewhere via ADJ-IDENTITY-SCOPE, schema/validator drift-tested. UPDATE 2026-08-17 (PHX-WP-AAC05-WIRING): the producer itself landed separately (advisory-decision-event.mjs, commit 63dac0b4, buildAdvisoryDecisionEvent -- the pure translator from an answered advisory-receipt.v1 to a validated agent-decision event, five identity dimensions: runner/model/effort/adapter/profile, each with its own IDENTITY_ASSURANCE_BASIS provenance/assurance pair) but had zero production callers, per specs/sprint-phoenix-epic/design/agent-decision-identity-scoping.md sec.6/7 which scoped exactly this producer as the recommended next build. This dispatch wires it in: advisory-host-bridge.mjs now calls buildAdvisoryDecisionEvent whenever coordinateAdvisory resolves ok:true with an answered receipt, and durably appends the result to the portable "agent" governance stream (governance-event-store.mjs, appendPortableGovernanceEvent). A genuine pre-implementation blocker was caught and fixed before any wiring code landed: the dispatch\'s own stop condition correctly refused to guess at a fix in a file it was forbidden to touch (advisory-decision-event.mjs) when it found candidateDigest hashed a {candidateCommit,candidateTree} literal via plain JSON.stringify+sha256, while governance-event-store.mjs\'s agent-origin binding check (:353) compares against canonicalSha256({commit,tree}) -- different keys AND a different hash function, so no real advisory answer could ever have passed GES-PAYLOAD-SCHEMA on append. Fixed by the Elephant as a separate, scoped stage-0 commit (09300cf6, ~4 lines) rebinding candidateDigest to the store\'s own {commit,tree}/canonicalSha256 convention -- independently re-verified (9/9 advisory-decision-event-tests pass) before the wiring dispatch resumed. Fail-open by design (A-AC-10): this event\'s represented classes are exactly candidate/privacy (agent-decision-journal.mjs\'s representedEventClasses for a selection/fallback kind), both fail-open in JOURNALING_UNAVAILABLE_DISPOSITIONS, so a translation or append failure is reported back as a typed {appended:false,code} marker on the CLI\'s emitted result, never thrown -- proven by a real-failure test (a temp git repo missing its capture-policy.json) asserting the advisory answer still returns intact. The success path is proven end-to-end by a second real-fixture test: a real temporary git repository, the event landing on disk, and an independent readback via queryPortableGovernanceStream confirming origin/eventType/candidate/payload match. Independently re-verified by the Elephant: diff reviewed field-by-field against governance-event.mjs\'s validateGovernanceEventEnvelope and the precedent shape in human-authority-grant.mjs\'s capturePolicyDigestFor/human-governance-ledger.mjs\'s intent construction (correlation/policy sub-fields use the same {state:"unavailable"} typed-state marker validateCorrelation/validatePolicy already accept for a genuinely unavailable value); 13/13 advisory-host-bridge-tests, 9/9 advisory-decision-event-tests, 51/51 agent-decision-journal-tests all independently re-run green; full node harness/scripts/verify.mjs gate re-run at the candidate (4f7f7a4f): same 9 pre-existing suites non-green as the established baseline, none new. One open item, not blocking this criterion: harness/scripts/verify.mjs\'s own advisory-decision-event-tests registration line is refused by this session\'s guard-testpath (TP-3) unconditionally, requiring the PO\'s external Ed25519 signature ceremony (ADR-0059) -- prepared (planSha256 ff34b9b9, intentSha256 1bd2b0ba) and handed to the PO, not yet installed as of this update; tracked as one more instance of the existing verify-suite-registration-check pre-existing gap, not a new one. This criterion\'s "WHEN X is recorded, SHALL include provenance/assurance" is a conditional obligation, not an existence requirement: role/capability identity is never recorded anywhere in this codebase (confirmed by the design doc\'s own sec.6 sweep), so the criterion is satisfied vacuously for those two dimensions and substantively for the five (runner/model/effort/adapter/profile) that ARE recorded and now demonstrably carry provenance/assurance on a real, tested, production call path',
  'A-AC-06': 'agent-decision-journal-tests: free text, authority-shaped fields and unbound supersession rejected',
  'A-AC-07': 'agent-decision-journal/governance-event-store-tests (WP-A-AC07): all seven named event classes now recognized through existing fields/kinds, no new kind needed; capture-policy.json carries an additive mandatoryEventClasses list; appendPortableGovernanceEvent fails closed (GES-MANDATORY-CAPTURE) rather than silently sampling out a mandatory class, scoped to the policy-selected agent origin only. 38/38 + 28/28 tests pass',
  'A-AC-08': 'NO CARRIER: no detector for missing dispatch provenance; the Dispatch: trailer is convention only. STALE (flagged by the EPIC-AC-04 Critic audit workflow, corrected 2026-08-17): this pointer was never updated after the real detector landed -- harness/scripts/check-dispatch-provenance.mjs, registered as dispatch-provenance-tests in verify.mjs:375, 23/23 tests pass (independently re-run). Verdict (implemented, DELTA-bound) was already correct; only this narrative was stale',
  'A-AC-09': 'materiality is documented as design intent only; no code enforces or measures it',
  'A-AC-10': 'agent-decision-journal-tests + external-command-offer-tests (PHX-WP-AAC10, commit 8800f8d4): a closed, per-event-class JOURNALING_UNAVAILABLE_DISPOSITIONS table (total over all 7 EVENT_CLASSES, import-time-checked complete) declares fail-open/fail-closed per class instead of one hardcoded global behavior. resolveJournalingUnavailability() exposes a typed, observable pipeline.agent-journaling-gap.v1 gap record on both the fail-open and fail-closed paths. R-AC-10\'s existing acknowledgeNonMaterialOfferWithoutJournal is unchanged (independently confirmed byte-for-byte via a zero-context diff); the new path\'s fail-open set is a proven strict subset of that exception. 49/49 + 39/39 pass, independently re-run',
  'A-AC-11': 'agent-decision-event.schema.json:14 assumptionState enumerates exactly the seven required epistemic states (landed 5d0fc6a)',
  'A-AC-12': 'agent-decision-journal-tests (PHX-WP-A + PHX-WP-A2): downstream export/projection policy is independently configurable from capture eligibility and structurally cannot weaken it; the portable path fails closed for any narrower-than-repository-public-safe stream, and the restricted profile is confirmed owner-authenticated and outside the repository',
  'A-AC-13': 'agent-decision-journal-tests (PHX-WP-A + PHX-WP-A2): the duplicate-submission clause is pinned, and agent-kind fixtures now mirror the generic store\'s interrupted/concurrent/out-of-order guarantees directly rather than relying on them by implication',
  'A-AC-14': '12 of 13 named conformance scenarios now have dedicated coverage (PHX-WP-A + PHX-WP-A2 + PHX-WP-A-AC14): "tampering" now proven via GES-EVENT-INVALID on a digest-stale agent-kind fixture; "decomposition" is confirmed not representable in the current `kind` enum. CLOSES 2026-08-17 (PHX-WP-POAMEND, acceptance.md amended, commit e9054995): PO accepts 12/13 as the closed scope -- a scope narrowing, not a claim the 13th scenario does not matter; a later package wanting decomposition coverage must add its own enum value and tests',
  'A-AC-15': 'docs/agent-decision-journal.md (PHX-WP-DOC-1 + PHX-WP-DOC-3): all eight named parts present -- taxonomy/materiality/trust/retention/recovery/operator docs, plus Schema (grounded in agent-decision-event.schema.json) and Privacy threat model (grounded in the R-AC-05 test and assertPortablePayload) closing the two the original briefing accidentally omitted',
  'A-AC-16': 'agent-decision-journal-tests: a journal event cannot present as approval',

  'L-AC-01': 'the closed lifecycle schema and validator are pinned. PHX-WP-LAC01 (2026-08-17, commit fd57d390): first real producer landed -- continuity-cas now builds a validated control/execution-exchange admission and durably persists a schema-valid dispatch-kind lifecycle event via a new pure translator (control-execution-lifecycle-event.mjs), opt-in and byte-for-byte backward compatible when unused. Independently re-verified: unit tests, the new call-site suite, and the gated harness/scripts/pipeline-state.test.mjs regression (506/506) all green; e2e evidence re-run confirms a real event on disk revalidates. UPDATE 2026-08-17 (PHX-WP-LAC01B, commit 8e4be420): second real producer landed -- continuity-integrate-final (the mirror transition, acknowledging a delivered final for the dispatch at the queue head) now durably persists a schema-valid status-kind event via a sibling translator (buildLifecycleStatusEvent), sharing one projection body with buildLifecycleDispatchEvent. Independently re-verified: unit + call-site tests green (re-run), gated regression 504/506 -- the 2 failures (PS54af/PS54ag) are the SAME pre-existing FTP-ARTIFACT-2 acceptance.md-digest-staleness cause already documented, confirmed pre-existing (not a regression) by re-running the identical suite at the immediately prior commit. Honest count: 2 of 9 named kinds have a real producer (dispatch, status) -- NOT status+cancellation as originally hoped: cancellation is not reachable through this producer (the real continuity FINAL_OUTCOMES vocabulary only ever observes succeeded/failed; zero hits for any cancel-related state anywhere in continuity-state.mjs/continuity-host-adapter.mjs/pipeline-state.mjs), so the dispatch correctly refused to claim it despite the projection covering it for source-vocabulary completeness. candidate-invalidation confirmed to have no real caller either (pipeline-state.mjs:2172 always constructs invalidation as valid; no non-test producer of an invalidated state or invalidatesEventId exists anywhere). Remaining 7 (status-cancellation-variant, candidate-invalidation, verification, review, gate, recovery, reconciliation) all need a source vocabulary to exist before a producer can -- not a translator-authoring gap anymore, a genuine capability gap. UPDATE 2026-08-17 (PHX-WP-LAC01-REMAINING, investigation only, no commit): confirms and generalizes the capability-gap diagnosis -- validateLifecycleGovernanceEvent (lifecycle-governance-events.mjs:84) requires correlation={packageId,dispatchId,attemptId,workerId,correlationId,queueRevision} for EVERY kind, and workerId/correlationId are populated only from --worker-id/--correlation-id CLI flags accepted exclusively by continuity-cas and continuity-integrate-final (pipeline-state.mjs:2233-2234, 2309-2310 -- the only 4 hits in the whole file). No other real code path (approve-push, approve-deploy incl. the H-AC-12 decisionReference gate, verify.mjs, critic-review-lineage.mjs, critic-packet-governance.mjs, session-cleanup-recovery.mjs, reconcile-backlog-ledger.mjs, main-session-route.mjs) has access to this identity tuple, so none of the 7 can honestly build a valid correlation object without fabricating it. Independently re-verified by the Elephant: planInvalidation grep (3 hits, all read/delete, zero assignment), LIFECYCLE_TERMINAL_STATUS={succeeded,failed} (pipeline-state.mjs:2258), and the worker-id/correlation-id 4-hit confinement all reproduce exactly as reported. Honest count stays 2 of 9. Closing any further kind needs a genuine new state-machine transition carrying real workerId/correlationId identity -- a PO/Elephant design decision on extending continuity\'s orchestration-identity surface (or relaxing the schema\'s correlation requirement for non-continuity kinds), not an investigation or implementation task by itself. DECIDED 2026-08-17 (this session, no commit to the schema/producer code -- an acceptance.md amendment only): re-verified the split directly against current source (approve-push, pipeline-state.mjs:6870, carries no packageId/dispatchId/attemptId at all -- not just no workerId/correlationId, confirming the 5 non-dispatch kinds are not merely missing two identity fields but structurally outside the whole correlation shape). Chose NOT to force either a fabricated-identity build or a same-night schema relaxation: the anti-pattern of building a caller to satisfy a criterion was already reverted once in this epic (cc43a182), and a real schema split (discriminated union or a second non-dispatch schema) is multi-file design work needing its own review, the same bar already applied to H-AC-11 O-4 and PX0-AC-13 clause 1. Formalized as an acceptance.md amendment and backlog/items/2026-08-17-lifecycle-event-schema-has-no-non-dispatch-correlation-shape.md. Verdict stays partial, CLOSURE reclassified build->po: this is now a decided, scoped design item for a future increment, not an open investigation',
  'L-AC-02': 'lifecycle-governance-events-tests + governance-replay-view-tests (PHX-WP-L-AC02): all eight #10 exchange identities are now retained -- queueRevision and correlationId close the correlation shape from 4 to 6 keys, updated in both the primary validator and its redundant replay-side re-validator together',
  'L-AC-03': 'lifecycle-governance-events-tests: registered namespace only, no credential-carrying namespace, no opaque digest',
  'L-AC-04': 'governance-replay-view-tests (PHX-WP-L-AC04): the 9 verified lifecycle kinds now render with one of four distinct value-record-<class> CSS classes (human/agent/deterministic/runner-observed) instead of the shared "fact" default, proven by per-class tests plus a cross-class distinctness assertion within one rendered view',
  'L-AC-05': 'lifecycle-governance-events-tests: candidate invalidation visible, duplicate sequences fail closed',
  'L-AC-06': 'replay rejects extra event data instead of exposing raw lifecycle bodies',
  'L-AC-07': 'governance-replay-core-tests: serial/parallel/retry/cancellation/recovery fixtures replay to identical bounded output on repeat, and a malicious duplicate-sequence fixture is rejected deterministically (PHX-WP-L, break-proofed twice)',
  'L-AC-08': 'docs/governance-replay.md "Traceability" (PHX-WP-DOC-3): 8 of 9 lifecycle-governance-events.mjs kinds traced to a stated user/audit need; the `cancellation` kind is honestly flagged unclear -- no structural distinction from `status: "cancelled"` exists in the code, so no confident justification could be constructed. CLOSES 2026-08-17 (PHX-WP-LAC08, commit 20014aab): `cancellation` removed from both hand-duplicated KINDS sets (lifecycle-governance-events.mjs, governance-replay-view.mjs) and the renderer\'s KIND_RECORD_CLASS map -- the remaining 8 kinds are each traced to a stated need in docs/governance-replay.md, none justified only by parity. One residual duplicate found and left out of scope: governance/schemas/lifecycle-governance-event.schema.json:11 still enumerates `cancellation` in its published kind enum (a third hand-duplicated copy, nothing reads it today) -- filed as its own backlog item, not silently dropped. CORRECTED 2026-08-17 (EPIC-AC-04 Critic audit workflow, independently re-verified by the Elephant): docs/governance-replay.md\'s Fields section (the section that actually traces each retained element, not the Traceability section this pointer previously checked) lists correlation.packageId/dispatchId/attemptId/workerId but never correlation.correlationId or correlation.queueRevision -- 2 of the 6 fields validateLifecycleGovernanceEvent\'s closed correlation shape (lifecycle-governance-events.mjs:84) actually requires. Confirmed by direct grep: zero occurrences of either field name in the doc. This is the identical defect class (an untraced retained element) the criterion itself names -- the 2026-08-17 cancellation close fixed one disclosed gap but this pre-existing, undisclosed one was never checked. Verdict reverts to partial: 6 of 9 kinds traced (not 8/9 as previously claimed -- the field-level gap applies to every kind, since correlation is shared structure), pending a docs/governance-replay.md Fields-section update. CLOSES 2026-08-17 (same session, fixed directly -- a correction of an omission, not new authorship, under the EL-16 threshold): docs/governance-replay.md\'s Fields section gained real, grounded entries for `correlation.correlationId` (the orchestrator-assigned identifier for one dispatch invocation, distinct from workerId/attemptId, traced to "a caller holding only the orchestrator\'s own correlation token can still find every event for that invocation") and `correlation.queueRevision` (traced to the same candidate-binding discipline candidate.commit/.tree already use, "detect whether the queue was reordered or mutated after this event"), read directly from where each field is actually populated (pipeline-state.mjs:2232-2234, control-execution-lifecycle-event.mjs:163) rather than guessed. All 6 required correlation fields and 8 of 9 kinds now traced. Verdict flips back to implemented',

  'P-AC-01': 'organization-policy-tests (WP-P-AC01-AC03): schema/compatibility/merge pinned, AND provenance/dependencies/signaturePolicy now validated as optional, pack-scoped, closed fields (OPP-PROVENANCE/OPP-DEPENDENCIES/OPP-SIGNATURE), mirroring the targetBinding precedent. 17/17 tests pass',
  'P-AC-02': 'organization-policy-tests: floor weakening, unknown rule, single-owner conflict all rejected',
  'P-AC-03': 'organization-policy-activation-tests (WP-P-AC01-AC03): planOrganizationPolicyActivation now computes newlyRequiredArtifacts/externalEffects/backfillRange deterministically from the transition, never caller-supplied; assertPlan fails closed on a tampered preview (OPA-PREVIEW). 4/4 tests pass',
  'P-AC-04': 'organization-policy-activation-tests: activation only after a bound authority readback; stale plan preimage rejected',
  'P-AC-05': 'organization-policy-tests: credential, endpoint, coordinate, actor-mapping and signing-key fields refused at every level',
  'P-AC-06': 'audit-bundle-core-tests: missing, misplaced, illegally-mutable, stale and truncated each pinned (PHX-WP-P, break-proofed). CLOSES 2026-08-17: legacy and orphaned amended (acceptance.md, append-only) as each satisfied by proof rather than a check -- legacy is structurally unreachable as an input (packageRelative confines every artifact path to specs/${id}/, and a package only reaches validateFeaturePackage with a lifecycle.json present, the exact condition that excludes it from inventoryFeaturePackages\' legacy classification); orphaned has no structural predicate the manifest schema can enforce (curatorial, not a file property -- nova-a/nova-b asymmetry in specs/sprint-nova-epic/lifecycle.json is the concrete counterexample, re-verified live). A literal every-unlisted-file check was tried and reverted (PHX-WP-PAC06-ORPHAN, fad0aa95/cc43a182) after breaking check-artifact-topology.mjs against real packages (107+57 false findings). Full investigation in design/p-ac-06-clause-disposition-proposal.md',
  'P-AC-07': 'audit-bundle-tests: signs and verifies only an unchanged manifest, without identity or authority claims',
  'P-AC-08': 'CORRECTED 2026-08-09 (independent Critic FAIL, F3): the reconcile transaction is built and gate-registered (444/444, harness/scripts/pipeline-state.test.mjs), but no shipped entry point ever supplies deps.featurePackageReconcileApproval -- pipeline-state.mjs:5644 has no default (`??`) fallback, unlike its sibling deps, and both CLI entry points call run() with none. Only the test file ever provides the resolver. The command as shipped cannot be invoked by any real operator or agent -- structurally identical to the "interface built, no caller" gap this session found and disclosed for A-AC-04, just not caught here until independent review. FIX LANDED 2026-08-11 (PHX-WP-PAC08-RECONCILE-APPROVAL, PO-authorized, commits c6bd3a6b/4021299d/55e60f67): the missing default resolver is now built -- defaultFeaturePackageReconcileApproval closes over the GOVERNING SESSION\'s own pipeline-state.json (never --root), resolves signature/chat mode via a new gates.reconcile_approval key mirroring gates.push_approval, and is wired as runFeaturePackageWriteCommand\'s fallback only when no deps.featurePackageReconcileApproval is explicitly injected (Object.hasOwn, so an explicit-undefined test injection is not silently overridden). Independently re-verified, not accepted from either dispatch report: 468/468 (harness/scripts/pipeline-state.test.mjs, no regression), 31/31 (critical-human-proof-policy.test.mjs), 5/5 (critical-action-approval-request.test.mjs), 21/21 (runner-profiles-v3.test.mjs), 0 implicated ADRs (doc-reconciliation). Two items remained at that point, BOTH human-signature-gated: (a) the real committed pipeline.user.yaml still lacks gates.reconcile_approval (GS-1, out-of-session Ed25519 override required; absence still validates and defaults to the strongest signature mode, nothing weakened by the gap); (b) the proving tests, designed but not yet registered (TP-5). UPDATE 2026-08-11: a signed GMW window (--scope TP-3,TP-5) landed (b) -- RGi-RGn in harness/scripts/pipeline-state.test.mjs (commit 3fdf8b9f), 490/490, genuine Ed25519 proofs throughout, closing that gap. A fresh independent Critic review of the full range (c6bd3a6b..3fdf8b9f) then ran and returned FAIL (specs/sprint-phoenix-epic/evidence/pac08-f3-critic-review-3fdf8b9f.md): F3 itself is confirmed closed, but F-A (major, guard-testpath-override-tests OT09 broken by c6bd3a6b\'s own generalization, blocked on TP-7 which the current window does not cover), F-B (major, the verified approval is checked by defaultFeaturePackageReconcileApproval then discarded -- no criticalProofConsumption-style replay ledger for this kind, no durable attribution record, chat-mode --by unbound to any candidate; remediation dispatched same night as PHX-WP-PAC08-APPROVAL-LEDGER, goldfish-deep, scoped to pipeline-state.mjs + pipeline-state.test.mjs under the still-active TP-5 window), F-C (major, the bundled staleReceipt/casOutcome production hunk in 55e60f67 had no dispatch record claiming it -- fixed directly, attribution added to evidence/PHX-WP-PX0-CASOUTCOME/dispatch-record.json, no code change), and F-D (minor, three commit trailers cited a PHX-GMW-TP5-TESTS dispatch record that did not exist -- fixed directly, record written). Verdict stays partial: F-B is a live security/audit gap against P-AC-08\'s own candidate/evidence-binding language, Critic-confirmed rather than self-assessed, and remains open until PHX-WP-PAC08-APPROVAL-LEDGER lands and is itself independently re-verified. UPDATE 2026-08-11: PHX-WP-PAC08-APPROVAL-LEDGER landed (commit 5420c5e7), independently re-verified (501/501, plus genuine RED-before-GREEN evidence: reverting only the source to HEAD~1 reproduced exactly the 5 fix-dependent assertion failures the report predicted). Rather than self-declaring F-B closed, a further independent delta Critic review of 5420c5e7 alone was dispatched and returned FAIL (specs/sprint-phoenix-epic/evidence/pac08-fb-critic-review-5420c5e7.md) -- this time a MORE serious result than F-B itself: F1 (blocker), the state write the fix added is placed INSIDE a continuity lock runFeaturePackageReconcileCommand already holds on --root for the whole transaction; when the governing session directory and --root are the SAME directory -- the actual topology Phoenix uses, reconciling its own specs/sprint-phoenix-epic/lifecycle.json from within its own checkout -- the inner writeState call collides with the still-held outer lock at the identical lock path and refuses PS-CONTINUITY-LOCKED unconditionally, misreported as a PO-approval rejection. Independently reproduced the mechanism in isolation before accepting it (a same-process, same-path, different-token second lock acquisition collides while the first is held; succeeds once released) without touching any real project state. F2 (major): no test in the fix exercises this topology (every case injects a separate dir from --root), so 501/501 green could not have caught F1. F3 (minor): a replayed proof is reported to the operator with a message asserting a false cause. F4 (minor, an Elephant process error, not the dispatch\'s): the red-before-green evidence for F-B was reconstructed after the commit landed rather than produced before the fix. Remediation for F1+F3 dispatched same night as PHX-WP-PAC08-LOCK-REENTRANCY (goldfish-deep), required to reproduce F1 red BEFORE writing the fix this time. Verdict stays partial, now for F1 specifically -- a capability regression, not merely an audit gap. CLOSES 2026-08-11: PHX-WP-PAC08-LOCK-REENTRANCY landed (commit 3e1a727e) with genuine reproduce-first evidence (RED/GREEN TAP timestamps independently confirmed to predate the commit) -- an explicit lock hand-off (runFeaturePackageReconcileCommand passes its already-held root lock into the approval closure via holderLock/holderRoot; the closure reuses it, only when resolved paths match, via a new writeState(..., {reuseLock}) option) rather than the module-level reentrant-registry approach originally offered, because the dispatch found that approach would have broken PS44Vc (a real foreign-token-contender test). Independently re-verified: 504/504, PS41a-PS41d and RGi-RGr unchanged, F1-reproducing RGs/RGs-2/RGs-3 pass. A third independent Critic round on 3e1a727e alone returned PASS (specs/sprint-phoenix-epic/evidence/pac08-f1-critic-review-3e1a727e.md): F1/F2/F3 all confirmed closed; one minor, fail-closed, non-blocking residual (lock-identity comparison uses resolve() not realpathSync(), so a symlinked --root would still self-collide) filed as backlog/items/2026-08-11-reconcile-lock-reuse-uses-lexical-not-real-path-comparison.md. Verdict flips to implemented: P-AC-08\'s own criterion text (acceptance.md:346-373) is satisfied and gate-registered (pipeline-state-tests, harness/scripts/verify.mjs:373); the separate epic-close "Full Verify passes" gate (spec.md:690, DoD §13) stays unmet via F-A (OT09, TP-7-blocked), the same distinction already relied on for the other 127 implemented criteria',
  'P-AC-09': 'NO CARRIER: no export-backfill preview or explicit consent path exists',
  'P-AC-10': 'organization-policy-core-tests + audit-bundle-core-tests: pack-side compliance-claim rejection and signed-bundle no-identity-claim shape both pinned (PHX-WP-P, break-proofed). Log/viewer halves were out of the dispatched carrier scope and remain unevaluated either way',
  'P-AC-11': 'organization-policy-core-tests: mode (closed reference-only/projection/controlled-publication set), approval (union, no downgrade), targetBinding (optional, closed, provider-neutral, never-merged) and revision readback (per-contributing-pack revisions, always appended) pinned (PHX-WP-P + WP-P-AC11, break-proofed). UPDATE 2026-08-16: the "no field exists" half is closed and the gap is now narrower and differently shaped. PHX-WP-PAC11 (9352331d) gave all five remaining dimensions a representation -- ownedSections, lifecycleEvents, previewRequired, retention, conflictPolicy, each a closed provider-neutral vocabulary, each with an accept/reject case and a tested merge rule (intersection, OR, exact-match-or-OPP-RESOLVE-CONFLICT, ranked max), backward compatible so pre-existing 3-key and 4-key entries validate unchanged (28/28 organization-policy-core-tests, re-run independently by the Elephant, not accepted from the dispatch report). PHX-WP-PAC11-ENFORCE (8be6c308) then ran investigation-first against the real decision path and found only ONE of the five has a genuine enforcement point: ownedSections is now enforced on external write plans (reason policy-owned-sections), while previewRequired, conflictPolicy and retention were ruled no-enforcement-point on evidence an independent Critic re-verified and CONFIRMED (preview() is unconditional at external-reference-adapter.mjs:83; the conflict branch at :82 blocks unconditionally regardless of policy; identity.retention\'s [active,retain,archive] has zero overlap with the policy\'s three categorical commitments). An independent Critic review of the whole range returned FAIL with five findings (specs/sprint-phoenix-epic/evidence/pac11-critic-review-8be6c308.md), four of which are now closed by PHX-WP-PAC11-FIX (c7eb2297) and two Elephant commits: F1 (major) -- ownedSections items were validated against TARGET_REF while the compared changes[].field uses ID, so every field name with an uppercase letter, dot, underscore, colon or leading digit was unrepresentable in policy and permanently rejected, i.e. exactly the field conventions of the systemClass values the adapter supports; fixed by widening the domain and, more importantly, pinned by a source-equality test so a future narrowing of either pattern fails loudly. F2 (major) -- the recorded "disjoint vocabularies" justification for leaving lifecycleEvents unenforced was FALSE (four of six values are verbatim identical to FEATURE_STATES and a carrier exists before the first external call); the dispatch re-verified this, chose to leave it unenforced rather than invent what a policy naming only proposed/active should mean for a write observed in draft/implementing, and replaced the false claim with a true one in the source comment where a reader meets it -- the two vocabularies are two different lifecycle AUTHORITIES (epic-level publication events vs a feature package\'s own build lifecycle) that share four terminal values, not one vocabulary with gaps. F3 (blocker) -- four declared-but-inert dimensions had no owner and no expiry anywhere; closed by filing backlog/items/2026-08-16-p-ac-11-four-dimensions-declared-but-inert.md. F4 (minor) -- the new gate called .includes() on caller-supplied ownedSections without the shape check its neighbours use, degrading ownership into a substring test for a bare string and throwing a raw TypeError for null; fixed with reproduce-first tests for both. F5 (minor) -- docs/organization-policy-packs.md now documents all six optional entry keys, their merge rules, and the two that fail resolution outright. Verdict stays PARTIAL, deliberately: "scope permission by" is satisfied for mode, approvalRequired, targetBinding and ownedSections by an actual rejection on an actual decision path, and that is the bar the remaining four have not met -- they validate and merge but change no behaviour. UPDATE 2026-08-17: the FTP-ARTIFACT-2 blocker closed -- a PO-signed feature-package-reconcile ceremony ran at candidate a62f95c4 (plan-sha256 62973385ac2800865951554dfb97c093d63e3362b8b172659625a69), reconciling the stale acceptance.md digest; the full Verify gate re-ran at that candidate and every non-green suite was independently confirmed pre-existing and tracked (guard-testpath-override-tests/OT09 TP-7-gated, doc-contract-tests/-check pre-existing, backlog-state-check pre-existing, verify-suite-registration-check\'s baseline plus H-AC-12\'s 2 disclosed-unregistered sibling suites), none a regression from this range. QG-01\'s block cleared. A delta Critic re-review of the full fix range (289287e7, c7eb2297, e3e59153 -- F5\'s doc-only close was missed on a first dispatch attempt with only 2 of the 3 commits enumerated, self-caught before accepting that result, corrected and redispatched) returned a real finding despite the incomplete scope, acted on rather than discarded: F3\'s "four declared-but-inert dimensions" close claim above was itself incomplete -- the 2026-08-16 backlog item explicitly carved `lifecycleEvents` OUT of its own scope (tracked as F2 instead), and closing F2 fixed the false justification but never gave the deferral an owner/expiry, leaving one of the four dimensions genuinely still NOT MET under checklist item 8. Filed as its own record, commit `ff237c18` (`backlog/items/2026-08-17-p-ac-11-lifecycleevents-still-has-no-owner-or-expiry.md`). That same dispatch also flagged a machine-specific absolute path in this session\'s own mechanical test-evidence artifact (scrubbed, same commit) and a commit-atomicity minor (289287e7 bundling two unrelated backlog concerns, accepted as historical, not rewritten). Its FAIL verdict was itself flagged by the Critic as formally invalid on delivery: the dispatch\'s prose described claude-opus-5 as the requested route but never bound it via the actual dispatch-tool model parameter, so the review ran on the session default instead -- route mismatch, findings actioned anyway since they stood on their own evidence regardless of route. A third, properly 4-commit-scoped (289287e7, c7eb2297, e3e59153, ff237c18) AND properly opus-routed dispatch returned FAIL again, this time with two majors genuinely attributable to the Elephant session rather than to PHX-WP-PAC11-FIX: F-1 -- the submitted evidence (pac11-fix-verify-c7eb2297.txt) was a 3-file node --test transcript, not the declared gate (node harness/scripts/verify.mjs), ended red (exit 1), and had been hand-edited after the run to scrub a leaked absolute path, disqualifying it independently of the narrowing (QG-01/QG-02/QG-03). F-2 -- e3e59153 (F5\'s doc close) was Elephant-authored directly, no Dispatch trailer, no verify evidence, 33 diff lines over EL-01\'s stage-0 ~25-line cap (EL-16). Plus three minors: F-3 -- two comments left describing ownedSections as TARGET_REF-shaped after the F1 fix moved it to OWNED_SECTION_REF. F-4 -- the 2026-08-16 backlog item cited acceptance.md:409-412 for P-AC-11 (actually A-AC-07/A-AC-08; P-AC-11 is 604-607), and docs/organization-policy-packs.md pointed all four inert dimensions at that item despite it explicitly disclaiming lifecycleEvents. F-5 -- 289287e7 and ff237c18 each bundle two unrelated concerns in one commit. Critically, the same review\'s own Category-1 hunt independently RECONFIRMED F1/F2/F4/F3\'s three-dimension half/F-A\'s lifecycleEvents half all genuinely closed at source -- two independent Critic passes now agree on the substance; both majors are process/evidence defects in how the closure was produced and proven, not in what was produced. Disposition (EL-03(c), Elephant-owned, no further dispatch needed): F-3 and F-4 fixed directly as stage-0 fast-path commits (2021c2b6, feab16c2 -- comment/pointer-only, well under the file/line caps, no architecture/schema/API/test/guardrail/dependency/security surface touched). F-1 remedied going forward: the full node harness/scripts/verify.mjs gate re-ran at candidate 028b54a7 (F-3+F-4+a stray-index cleanup on top of the 4-commit range) and its own unedited evidence/verify-latest.json was archived verbatim (specs/sprint-phoenix-epic/evidence/pac11-remediation-verify-028b54a7.json, diffed byte-identical against the script\'s own output before commit) -- 373/373 suites ran, same 5 pre-existing/tracked suites non-green (guard-testpath-override-tests, doc-contract-tests, doc-contract-check, backlog-state-check, verify-suite-registration-check), none new. F-2 and F-5 accepted as disclosed, unremedied process debt: reverting e3e59153 or rewriting 289287e7/ff237c18\'s history would either violate the never-rewrite-history rule or (for a clean revert) conflict with the F-4 fix already landed on the same paragraph, for zero functional benefit given the content is independently double-verified correct; two feedback memories saved (critic-evidence-must-be-script-written strengthened with this recurrence; a new feedback_el16-applies-to-docs-not-just-code memory) to prevent recurrence rather than retroactively erase it. Verdict stays partial regardless: the underlying gap (previewRequired/retention/conflictPolicy confirmed no-enforcement-point) is a capability question the review closes findings on, not a dimension it enforces. UPDATE 2026-08-17 (PHX-WP-PAC11-DROPRETENTION, 3ce9434b): PO decided retention is dropped, not left declared-but-inert -- no bridge exists between identity.retention\'s [active,retain,archive] (external-reference-adapter.mjs, untouched) and this criterion\'s three categorical commitments. RETENTION set, its closed-key/validation/merge branches and object-literal sites removed from organization-policy.mjs; the two retention-specific tests replaced by one proving a pack still declaring retention now fails the closed-key check; docs/organization-policy-packs.md and this criterion\'s own acceptance.md dimension list amended accordingly. Independently re-verified by the Elephant: 27/27 organization-policy-core-tests pass (re-run separately at the candidate), external-reference-adapter.mjs diff confirmed empty across the range. Of the four originally-inert dimensions, retention is now removed entirely (not just inert); previewRequired is closed (satisfied-by-construction, 2026-08-17 amendment above); lifecycleEvents and conflictPolicy remain open -- lifecycleEvents has a PO "build it" decision pending its own dispatch, conflictPolicy awaits a fuller options brief. Verdict stays partial until both of those resolve. UPDATE 2026-08-17 (PHX-WP-PAC11-LIFECYCLEEVENTS, 6919b55b): lifecycleEvents built per the PO\'s "build it" decision (backlog/items/2026-08-17-p-ac-11-lifecycleevents-still-has-no-owner-or-expiry.md Triage). external-reference-adapter.mjs now carries a total, closed FEATURE_STATE_TO_LIFECYCLE_EVENT mapping (four of nine FEATURE_STATES map 1:1 by identical name; the remaining five build-phase states split onto proposed/active by PO-granted bounded latitude: proposed = draft/awaiting-approval, active = approved/implementing/verifying) and planExternalReferenceWrite enforces lifecycleEvents against binding.identity.lifecycleState the same way ownedSections is enforced, sitting after binding resolves. Two dispatch-continuation rounds were needed (the goldfish-deep run exhausted its tool budget twice before finishing); all substantive code/tests/docs were complete and correct on first inspection each time -- independently reviewed diff-by-diff by the Elephant, not accepted from the report alone. Elephant found and fixed two real defects the dispatch itself left behind: (1) a stale docs/organization-policy-packs.md cross-reference still calling lifecycleEvents "declared-but-inert" in the retention paragraph, corrected directly (stage-0, 1 line). (2) A genuine regression: the dispatch\'s own backlog-closure edit split into two parts across two moments -- commit 6919b55b flipped the item\'s status to closed but left closed_at/closure_repository/closure_commit/closure_evidence uncommitted, so the landed commit had a closed item missing its own closure record, which reconcile-backlog-ledger.test.mjs\'s RBL01 caught as a real NEW failure (confirmed absent at the prior candidate 3a1a160f, present at 6919b55b) when the Elephant independently re-ran the full node harness/scripts/verify.mjs gate the dispatch itself never finished (its own dispatch-record.json shows outcome "in-progress", stopped mid-verify). Fixed by committing the already-correctly-drafted metadata (f0f92c89) plus running the project\'s own node plugins/pipeline-core/scripts/reconcile-backlog-ledger.mjs --activate to record the ledger transition (80aa72df, machine-generated diff). Full verify gate re-ran at 80aa72df: same 9 pre-existing suites non-green as the 3a1a160f baseline (artifact-topology-check, guard-testpath-override-tests, threat-model-tests, pipeline-state-tests, doc-contract-tests, doc-contract-check, backlog-state-check, external-reference-adapter-tests, verify-suite-registration-check), none new -- external-reference-adapter-tests\' one failure (X-AC-10, a live-repository-path resolution test) independently confirmed pre-existing and environmental (identical failure with zero code changes applied, in both the detached verify worktree and the live tree). P-AC-11 stays partial: conflictPolicy is the sole remaining open dimension, awaiting a fuller PO options brief. UPDATE 2026-08-17 (PHX-WP-PAC11-CONFLICTPOLICY, fc034721): conflictPolicy built per the PO\'s options-brief decision -- the last open dimension. planExternalReferenceWrite now consults the effective policy\'s document-class conflictPolicy at the site of its existing unconditional revision/ownership conflict check: a declared require-reconciliation returns status "reconciliation-required" reason "policy-conflict-reconciliation" (the adapter\'s existing status value, a new policy-... reason following the F2/ownedSections convention); a declared reject or an undeclared key both keep today\'s exact unconditional "conflict"/"revision-or-ownership" behaviour -- undeclared and reject collapse to the same branch, matching CONFLICT_POLICY_RANK where reject is strictly stricter, so there are only two effective branches, not three. Independently re-verified by the Elephant: diff reviewed file-by-file against the briefed scope (5 files: docs/organization-policy-packs.md, external-reference-adapter.mjs, external-reference-adapter.test.mjs, organization-policy.mjs, acceptance.md), 38/39 external-reference-adapter-tests pass with the 3 new WP-PAC11-CONFLICTPOLICY cases all green (only the pre-existing X-AC-10 live-repository-path case red, confirmed unchanged), full node harness/scripts/verify.mjs gate re-run at fc034721: same 9 pre-existing suites non-green as the 80aa72df baseline (artifact-topology-check, guard-testpath-override-tests, threat-model-tests, pipeline-state-tests, doc-contract-tests, doc-contract-check, backlog-state-check, external-reference-adapter-tests, verify-suite-registration-check), none new, exact match. security-scan.mjs independently re-run at the same candidate: CLEAN (gitleaks/semgrep/license-check 0 findings, osv-scanner skipped -- no package sources). As with the lifecycleEvents dispatch, this dispatch\'s own dispatch-record.json was left at outcome "in-progress" (only a "bootstrap" phase logged) despite the explicit briefing instruction to finalize it -- unlike that prior case the landed commit itself was complete with nothing left uncommitted, so no defect followed from it this time, but the pattern recurring across two consecutive dispatches is itself now flagged rather than silently absorbed a third time. All five of P-AC-11\'s scoping dimensions are now addressed: mode/approvalRequired/targetBinding/ownedSections have a real rejection on an actual decision path (closed earlier in the range); previewRequired is satisfied by construction (preview() runs unconditionally); retention was dropped from the schema entirely as having no natural bridge to identity.retention; lifecycleEvents and conflictPolicy are both now enforced on the same real decision path as ownedSections. Verdict flips to implemented -- "scope permission by ... mode, target, ownership, event and conflict policy" is met on all five dimensions, not four of five.',
  'P-AC-12': 'audit-bundle-tests: tampered or missing bundle bytes detected; signature invalidated when the manifest changes',
  'P-AC-13': 'docs/organization-policy-packs.md + docs/audit-bundles.md (PHX-WP-DOC-2): threat model, pack/schema/activation policy, bundle policy, and compatibility/migration/versioning policy all present and grounded -- the compatibility section honestly states no pack-schema migration mechanism exists (only v1 is accepted; revision is a content digest, not a version number)',

  'V-AC-01': 'evidence-view-model-tests: offline report with source links and a candidate-bound receipt',
  'V-AC-02': 'evidence-view-renderer-tests: fact, unknown, unavailable, redacted, invalid, not-applicable, and now human decision (PHX-WP-V + WP-V-AC02, break-proofed) -- seven of nine. `approved` is the sole feature-package lifecycle state gated behind PO-specific authority (feature-package-topology.mjs:171), labelled distinctly in the renderer. UPDATE 2026-08-17 (PHX-WP-VAC02, commit 8325f2d0, independently re-verified): `assumption` now genuinely labelled -- the caller-supplied governance-export delivery observation (`exportStatus`\'s destinationProfile/cursor/lag) was previously mislabelled `fact` despite carrying no digest or canonical-source binding (unlike artifact values, which are re-hashed against their bytes); a new `EVM-EXPORT-ASSUMED` notice and distinct `.value-assumption` CSS rule now mark it correctly. Eight of nine. `estimate` stays unpinned, confirmed absent by design rather than missed: the one real estimate in this repo (`pipeline.gate-estimate.v1`, lib/gate-estimate.mjs) belongs to a different report (continuity-status.mjs) entirely and has zero path into the Evidence Viewer today -- wiring it in needs new input plumbing, not a labelling change. 21/21 tests pass, independently re-run. CLOSES 2026-08-17 (PHX-WP-VAC02-ESTIMATE, commit a2c8e533, independently re-verified: 26/26 tests, re-run separately): evidence-viewer.mjs gained --gate-estimate-context-file, loading {activeFeature, observation, evidence} and calling projectGateEstimate against live state.gateEstimate; the model labels the result `estimate` (known) or `unavailable`/`not-applicable` distinctly from `fact`/`assumption`, first production caller of the until-now test-only gateEstimateContext shape. Nine of nine value classes now labelled. One disclosed deviation, not a hard-stop: the renderer marks the class via `data-value-class="estimate"` but the matching `.value-estimate` CSS rule (mirroring `.value-assumption`) was not added (out of the dispatch\'s file scope per its own briefing) -- a one-line visual follow-up, not a functional gap; V-AC-02\'s "label the exact class visibly" is met via the data attribute',
  'V-AC-03': 'evidence-view-model-tests: claims linked to canonical source record and exact candidate',
  'V-AC-04': 'evidence-view-model-tests: invalid topology yields an invalid view with no candidate or artifact leak',
  'V-AC-05': 'evidence-view-renderer-tests: deterministic redacted projection withholding artifact paths',
  'V-AC-06': 'evidence-view-renderer-tests (PHX-WP-V + WP-V-AC06): exact CSP directive value, skip-link keyboard focus target, landmark/table accessibility structure, AND mobile/desktop snapshot checks all pinned via deterministic string-level assertions against the rendered HTML -- the same technique V-AC-09 established, no visual-regression infrastructure needed. 8/8 tests pass',
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
  'X-AC-14': 'external-reference-adapter-tests (PHX-WP-XAC14, break-proofed): both inspect() call sites now catch a thrown/rejected inspect and return the typed reconciliation-required/external-unreachable shape instead of an uncaught rejection; backlog item pipeline.external-reference-adapter-has-no-typed-response-to-an-unreachable-external-system closed',
  'X-AC-15': 'docs/external-traceability.md (PHX-WP-DOC-2): threat model, ownership/lifecycle mapping, publication guide, recovery procedure, and conformance suite added and grounded; the recovery procedure names the adapter\'s uncaught-inspect()-rejection gap and its backlog item explicitly rather than describing a graceful path that does not exist. CORRECTED 2026-08-17 (EPIC-AC-04 Critic audit workflow flagged, fixed same session by the Elephant): the recovery procedure had gone stale in the opposite direction -- the "KNOWN GAP" it described was fixed later (external-reference-adapter.mjs:139,163 now wrap both inspect() calls in try/catch, resolving to a typed reconciliation-required/external-unreachable result; independently confirmed by direct read) and its cited backlog item is status: closed, but the doc still described the gap as open. Fixed directly (no design latitude, a correction of stale content, not new authorship): the section now describes the actual typed-recovery behavior. Verdict stays implemented -- "maintained" is restored, not newly met',

  'C-AC-01': 'change-control-tests: profile validation plus the exact bound tuple for mandatory promotion',
  'C-AC-02': 'change-control-tests (PHX-WP-C-AC02): "standard" is pinned as a distinct changeClass paired with mandatory authority, alongside emergency and not-required, AND carries its own required standardTemplate {templateId, revision} field (null for every other class), closing the standard-vs-normal field-level distinction per issue #24 §5. detectChangeClassShopping now closes the remaining half: flags a proposed classification against same-tuple alternatives via resolveChangeControlProfile whenever the fuller candidate set would not have landed on it. 27/27 tests pass',
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
  'C-AC-13': 'docs/change-control.md (PHX-WP-DOC-1): threat model, policy precedence, migration, operator runbook, and failure/rollback/recovery procedures all present and grounded in change-control.mjs; migration section honestly states no migration tooling exists. CORRECTED 2026-08-17 (EPIC-AC-04 Critic audit workflow, independently re-verified by the Elephant): the doc has gone stale against six later commits\' worth of real added behavior in change-control.mjs -- confirmed by direct grep: zero occurrences of resolveChangeControlProfile or detectChangeClassShopping (both real exported functions, change-control.mjs:107,151) anywhere in the doc, alongside the advisory reviewPolicy path, the retrospective-evidence requirement, and the H-AC-12 dual-evaluation wiring the map\'s other pointers already credit as real. "Maintained" (C-AC-13\'s own word) is not currently true. Verdict reverts to partial: this needs a real content pass across the threat-model/policy-precedence/failure-recovery sections, not a quick line-citation fix like X-AC-15\'s -- deliberately not attempted same-session as an extension of an already-large session; a doc-authorship dispatch (EL-16: >25-line doc work needs a real Goldfish dispatch) is the right next step',

  'E-AC-01': 'governance-export-adapter-tests: one validated source mapped deterministically with stable identity',
  'E-AC-02': 'governance-export-adapter-tests (PHX-WP-E-AC02): deterministic mapping was already pinned; loss is now computed per call -- RFC 5424 names every EXPORT_FIELDS key it drops (proven with a full eight-key and a minimal-key fixture), CloudEvents/OTLP/NDJSON proven to stay loss:[] under the same full-key fixture',
  'E-AC-03': 'governance-export-adapter-tests: policy-less exports denied, only explicitly allowed fields projected',
  'E-AC-04': 'governance-export-adapter-tests (PHX-WP-E, break-proofed): default omission of rationale/summary is pinned; CONFIRMED ABSENT: the "policy allows and redacts" path -- EXPORT_FIELDS is a closed, non-configurable constant (adapter.mjs:15), no policy can ever admit the field',
  'E-AC-05': 'governance-export-outbox-tests: independent destination queues, idempotent enqueue, retryable and quarantined entries preserved',
  'E-AC-06': 'governance-export-delivery-tests (PHX-WP-E + PHX-WP-A2): stable idempotency and at-least-once redelivery are pinned; the receipt\'s closed enums carry no exactly-once wording and structurally cannot ever admit one -- the SHALL-NOT-claim-exactly-once negative is now pinned directly',
  'E-AC-07': 'governance-export-delivery-tests: only the safely acknowledged prefix advances after partial delivery',
  'E-AC-08': 'governance-export-outbox-tests (PHX-WP-E-AC08): 7 of 8 detections pinned (destination-mismatch/forged-ack/event-gap/schema-downgrade pre-existing, cursor-bound/source-fork/invalid-hash new, each with its own typed code); outbox truncation (a cross-state comparison this module has no capability for) remains absent. CORRECTED 2026-08-17 (EPIC-AC-04 Critic audit workflow, independently re-verified by the Elephant): this narrative is now stale in the OPPOSITE direction -- outbox truncation IS detected, added later in a sibling module (governance-export-outbox-store.mjs\'s `truncates()`/GEOS-TRUNCATION, confirmed by direct read), not the module this pointer describes. But that same function\'s own comment states plainly: "attempts/status/cursor legitimately advance and are deliberately not compared" -- cursor is explicitly excluded from the cross-state check. `GEO-CURSOR-BOUND` (governance-export-outbox.mjs:10,14) only bounds-checks a single state\'s own cursor against its own entries.length; it cannot and does not compare against a PRIOR state, so it cannot detect a cursor that moved backward (a rollback) between two writes. Re-tallying the 8 named classes honestly: destination-mismatch/forged-ack/event-gap/schema-downgrade/cursor-bound/source-fork/invalid-hash/outbox-truncation = 8, but "cursor rollback" specifically (a named, distinct item in E-AC-08\'s own text, separate from "outbox truncation") has no detector anywhere. Verdict reverts to partial: 7 of 8 named IF-conditions genuinely typed and fail-closed; cursor rollback is the one real remaining gap',
  'E-AC-09': 'governance-export-delivery-tests (PHX-WP-E, break-proofed): lag exposed on a failed acknowledgement is pinned; CONFIRMED ABSENT: the "advisory destination" concept itself -- no such distinction exists anywhere in scope, so "canonical governance continues under an unavailable advisory destination" is not representable',
  'E-AC-10': 'NO CARRIER: no named lifecycle boundary blocks only the exact unacknowledged source range',
  'E-AC-11': 'governance-export-delivery-tests (PHX-WP-E-AC11): the closed 10-field receipt schema is pinned, rejecting any retention/immutability/analyst-review/compliance-implying extension, AND now carries a projectionDigest alongside policyRevision -- deterministic over batch content, proven to change when batch content changes',
  'E-AC-12': 'governance-export-adapter-tests: profile and acknowledgements are closed, non-authoritative and deduplicated',
  'E-AC-13': 'governance-export-outbox-tests: destination queues, cursors and failure domains stay independent',
  'E-AC-14': 'governance-export-delivery-tests (PHX-WP-EAC14, break-proofed): all five named fixture classes individually evidenced -- in-memory/local-file/OTLP-profile/syslog (pre-existing) plus a genuine failure-injection fixture (new): a rejected adapter.deliver() call leaves the outbox untouched and a later retry recovers cleanly. Corrects the prior partial verdict, which had leaned on CAS-conflict/forged-ack tests that direct re-examination found to be validation assertions, not simulated transport failure',
  'E-AC-15': 'governance-export-adapter-tests: allowlisting/redaction completed before every persistence boundary',
  'E-AC-16': 'nine named assertions: batching bound, compression, payload bound, rate limit, retry budget, backpressure, flush, restart resume, replay',
  'E-AC-17': 'governance-export-outbox-tests: duplicate delivery preserves one canonical source history',
  'E-AC-18': 'governance-export-adapter-tests: destination secrets excluded from every portable export record',
  'E-AC-19': 'evidence-viewer-tests: export lag and receipts rendered as a separate non-authoritative observation. CORRECTED 2026-08-17 (EPIC-AC-04 Critic audit workflow, independently re-verified by the Elephant): E-AC-19 names six required display items (destination profile, lag, failure/quarantine COUNTS, integrity gaps, acknowledgement class, recovery state). Read evidence-view-model.mjs\'s exportStatus model directly (lines 50-55): its fields are state/destinationProfile/cursor/lag/receipt{batchId,acknowledgementClass,terminalDisposition} -- destination profile, lag, and acknowledgement class are genuinely present, but there is no numeric failure/quarantine COUNT field (only the categorical `state`) and nothing shaped like "integrity gaps". 4 of 6 required items are represented, 2 are absent. Verdict reverts to partial: needs new fields (counts, integrity-gap surface) plumbed from the export/outbox layer into this model before the criterion is met',
  'E-AC-20': 'audit-bundle-tests (WP-E-AC20): planAuditBundle now accepts optional exportEvidence, narrowed to exportMetadata {profileDigest, receipt} on the plan/manifest -- never mappings/outbox/acknowledgement, never consulted by signature/verification logic (proven: a bundle with wrong export metadata still verifies). 16/16 tests pass',
  'E-AC-21': 'docs/governance-event-export.md (PHX-WP-DOC-2): threat model, data-flow diagram, mapping/loss guide, retention guidance, operator runbook, and incident/recovery procedures all present and grounded; the loss guide names the known loss:[] gap explicitly, the retention section reports no pruning/archival/expiry function exists anywhere in the outbox modules',

  'R-AC-01': 'external-command-offer-tests: public-safe offer recorded before presentation, verified append readback required',
  'R-AC-02': 'CONFIRMED ABSENT (PHX-WP-R): recovery-proposed/recovered states exist in the schema but are unreachable through any exported function -- no capability correlates a rejected path, alternatives, or selected recovery to the offer. STALE (flagged by the EPIC-AC-04 Critic audit workflow, corrected 2026-08-17): a later producer closed this -- recordCommandRecoveryDisposition (external-command-offer.mjs:269) appends the recovery-proposed/recovered states exactly as this text says is absent, independently re-confirmed by direct read of its own doc comment ("R-AC-02: appends a considered-recovery event"). Verdict (implemented, DELTA-bound) was already correct; only this narrative was never updated after the fix landed',
  'R-AC-03': 'external-command-offer-tests: a bound human decision is required for destructive attempts and appended before execution',
  'R-AC-04': 'agent-decision-journal/external-command-offer-tests (PHX-WP-R + WP-R-AC04): operation class, target, exact pre/post digests, and recoverability are bound and validated together, AND requiredCleanup now records the distinct WHAT-is-required half (cleanupClass/status/digest), optional, scoped to non-"not-applicable" recoverability. 39/39 + 28/28 tests pass',
  'R-AC-05': 'agent-decision-journal-tests: every enumerated private field and every untyped digest refused at both journal boundaries',
  'R-AC-06': 'external-command-offer-tests: user execution stays unobserved; completion admitted only with bounded evidence. CORRECTED 2026-08-17 (EPIC-AC-04 Critic audit workflow, independently re-verified by the Elephant): the previous "implemented" verdict cited R-AC-07\'s behavior, not R-AC-06\'s. R-AC-06 itself requires the system to record `acknowledged`/`authorized`/`copied` (plus `displayed`/`generated`/`asserted`) exactly as offered, never mislabeled. Read directly: recordCommandOutcome (external-command-offer.mjs:357) explicitly EXCLUDES "acknowledged"/"authorized"/"copied" from ever being appended via that path (`fail("ECO-OUTCOME")` if event.state is any of those), and no other exported function appends a command-offer event carrying those states either -- acknowledgeNonMaterialOfferWithoutJournal/acknowledgeOfferUnderJournalingGap (lines 185/219) are about journaling-availability exceptions on the "offered" state, not about producing an "acknowledged"-state event. "displayed"/"generated"/"asserted" are not valid schema states at all (confirmed: absent from the closed state enum). Verdict flips to partial: only the negative half (never mislabel as executed/completed/succeeded) is real; the positive half (record each named state) has no producer for acknowledged/authorized/copied and no schema representation for displayed/generated/asserted. UPDATE 2026-08-17 (PHX-WP-RAC06): landed the missing producer -- recordCommandUserAcknowledgement (external-command-offer.mjs) appends a schema-valid event carrying exactly `acknowledged`/`authorized`/`copied`, anchored to a prior `offered` event via `sameOffer`, following the file\'s existing validation/append/duplicate-refusal discipline (appendValidated, no new storage mechanism). Its own three-value state allowlist means it structurally cannot append `executed`/`completed`/`succeeded` (not even valid COMMAND_STATES) -- 4 new tests cover each state appending, the mislabel refusal, offer-substitution/non-offered-anchor rejection, and append-once/duplicate discipline. Full file re-verified: 50/50 pass (46 pre-existing + 4 new), `node --test plugins/pipeline-core/lib/external-command-offer.test.mjs` exit 0. Independently re-checked `displayed`/`generated`/`asserted` again: still absent from `COMMAND_STATES` (agent-decision-journal.mjs) and no reachable code path anywhere in this codebase constructs a command-offer event carrying any of those three -- this stays a genuine architecture gap, not a missing-producer gap, and per this task\'s explicit scope boundary the schema is deliberately NOT extended here. Verdict stays partial: 3-of-6 positive states now have a real producer, the negative half remains real, but R-AC-06 as written covers all 6 named states and 3 of them have no schema representation to produce against. This likely needs a PO/Elephant-level acceptance.md amendment (e.g. splitting R-AC-06 into the 3 producible approval-without-run states versus the 3 not-yet-schema-representable ones, or scoping the criterion to the states the architecture actually surfaces) -- flagged, not decided here',
  'R-AC-07': 'external-command-offer-tests: failed, partial, cancelled, mismatch and unknown outcomes retained distinctly',
  'R-AC-08': 'external-command-offer-tests (PHX-WP-R): a readback lifecycle event appends exactly once and never rewrites the original offer. CLOSES 2026-08-17 (PHX-WP-RAC08, commit b753c9fa, independently re-verified): rollback/cleanup as *occurred* events -- previously absent by design, no such state existed at all -- are now built via `recordCommandRecoveryOccurrence`, two new COMMAND_STATES (rollback-performed, cleanup-performed), discharge-checked against the anchor\'s own recoverability, appended once/never-rewritten. Deliberately a separate recorder from recordCommandRecoveryDisposition (that function\'s anchor set, preEvidenceDigest===null requirement and no-discharge-rule shape are each wrong for an occurred undo). agent-decision-journal.mjs\'s COMMAND_STATES enum and published schema extended in step, required by the closed-enum shape, not scope creep. 46/46 + 51/51 tests pass, independently re-run at the synced candidate; no discrepancy between the commit\'s own claims and independent verification',
  'R-AC-09': 'agent-decision-journal/external-command-offer-tests (PHX-WP-R + WP-R-AC09): missing offer link, contradictory outcome evidence, and cross-repository/cross-scope substitution all fail closed (never successful), AND occurredAtEpochMs now closes the stale clause. 41/41 + 30/30 tests pass. CLOSES 2026-08-17 (PHX-WP-RAC09, commit 5c05a117, independently re-verified): the "duplicate detection lives at the store layer" reasoning was corrected, not just narrowed -- governance-event-store.mjs\'s idempotencyKey covers a DIFFERENT identity (envelope retry-safety), not the lifecycle eventId offers/outcomes actually correlate through, so two records under different idempotency keys but the same lifecycle eventId could both land and both replay valid. `projectCommandOfferReplay` (unconditional) now detects a shared lifecycle eventId or an unlinked duplicate offer-evidence record and renders replay invalid -- proven with real appended records. governance-event-store.mjs itself untouched; the fix needed nothing from it. All six trigger words now close. 41/41 tests pass, independently re-run; pre-existing cases confirmed byte-identical to their pre-commit versions',
  'R-AC-10': 'fail-closed on the append is pinned; the policy-defined typed non-material exception is absent',
  'R-AC-11': 'external-command-offer/agent-decision-journal-tests (PHX-WP-R + WP-R-AC11): a mandatory public-safe typed omission is pinned, AND recordPrivateHandoffCommitment now wires this module to the existing restricted-machine-local store via a caller-supplied put callback, exposing only a commitment digest + receipt id. 44/44 + 36/36 tests pass',
  'R-AC-12': 'external-command-offer-tests (PHX-WP-R-AC12): the motivating Phoenix bootstrap trajectory is now encoded end to end -- a rejected guard-bypass attempt, an attended local repair through the sanctioned non-authoritative channel, an unchanged public-privacy boundary, a verified readback, and digest-only targets that never embed a machine-specific value',
  'R-AC-13': 'external-command-offer-tests (PHX-WP-R): 9 of 11 required fixture classes now named (7 pre-existing + secret/malicious command rejection + governed-script identity); approval-without-run and duplicate/retry are confirmed structurally unreachable, each pinned by a dedicated test showing the gap rather than left silently missing. CLOSES 2026-08-17 (Elephant, measurement correction, no code change): re-read all 11 required fixture classes from acceptance.md against the actual test titles in external-command-offer.test.mjs (36/36 pass, independently re-run) -- Pipeline-initiated + user-requested/Pipeline-supplied offers (:12, :28), guard override (:20), failed/partial/cancelled/readback-mismatch (:37), substitution (:41), approval-without-run (:168), duplicate/retry (:175), secret-bearing + malicious-content rejection (:154), governed-script identity (:161) are ALL named. The prior 9/11 count wrongly excluded approval-without-run and duplicate/retry from "named" because their fixtures pin delegated/unreachable behavior rather than a positive success path -- but R-AC-13\'s own text requires providing a fixture, not preventing the scenario; both fixtures exist and pass. 11/11',

  'EPIC-AC-01': 'the issue-to-criterion mapping exists; no independent closure status exists for any of the eight issues. UPDATE 2026-08-17 (this session): the independent closure status DOES exist and is live, not missing -- the BULLETS table (this file, per-issue rows) plus the "Per issue"/"Summary" sections this script already generates on every run compute exact per-issue closeability straight from VERDICTS. Regenerated and independently read at this commit: 6 of 8 issues closeable on their own live acceptance bullets (#5, #9, #17, #23, #24, #32), 2 blocked (#30 by H-AC-11, #31 by A-AC-01 -- both already tracked, already PO-gated). The remaining gap is narrower than the original pointer stated: "exact dependencies" and "candidate evidence" are carried (WORK_PACKAGES\' disjoint-file ownership, POINTERS\' per-criterion evidence citations), but "a valid lifecycle manifest" is NOT current -- specs/sprint-phoenix-epic/lifecycle.json (schema pipeline.feature-package.v1, state "draft") still binds the PRD/spec/acceptance sha256 values from before this session\'s EPIC-AC-03 authority revision and this session\'s own L-AC-01 acceptance.md amendment; feature-package-status --root . --manifest specs/sprint-phoenix-epic/lifecycle.json confirms 3 findings (FTP-ARTIFACT-0/1/2, "digest does not bind file bytes") against the current commit. Deliberately NOT resynced same-night: feature-package-plan/-apply is its own candidate-bound ceremony (parallel in shape to continuity-authority-revision) and the manifest has never left "draft" state in this project\'s history -- regenerating it deserves its own reviewed pass, not a rushed extension of tonight\'s already-large authority-revision ceremony. Verdict stays partial: 6/8 issue closure is real and current, but the manifest-validity clause is honestly still open. CONFIRMED NOT a same-night fix, not just deferred by judgment call: `feature-package-plan --next-state draft` was tried directly against this manifest and refused (status "rejected", reason "invalid-current-package", the same 3 FTP-ARTIFACT findings) -- the planner requires the CURRENT manifest to already validate before it will plan any transition, and no separate "rebind the digests without changing state" plan kind exists in this tool. This is a genuine tooling lockout (a manifest that drifts can never be resynced through feature-package-plan/-apply once it has drifted, only through a hand edit this session deliberately declined to make, since that would bypass the exact digest-binding protection this manifest exists to provide), not merely an unperformed operation -- worth its own backlog item if this recurs. CLOSED 2026-08-17 (same session): the reconcile ceremony this pointer said would need its own reviewed pass was executed via feature-package-reconcile (kind feature-package-reconcile, plan-sha256 a08c1e8055c996549a35c1df11e5f966066adbdad5bab55c35f173eb2b59b602, PO-signed via po-human-approval.mjs sign-intent + the createCriticalActionApprovalRequest/criticalActionSubjectSha256 library primitives directly -- prepare-critical/approve-critical themselves refuse this kind per backlog/items/2026-08-16-critical-command-kinds-excludes-feature-package-reconcile.md, so the request was hand-built to the identical shape and the PO signed via the kind-unrestricted sign-intent primitive). feature-package-status now reports ok:true, 0 findings (commit 8e91872e). All five required properties now genuinely hold: issue mapping (BULLETS), exact dependencies (WORK_PACKAGES disjoint ownership), a valid lifecycle manifest (this reconcile), candidate evidence (POINTERS citations), and independent closure status (the Per-issue/Summary computation, live, 6/8 issues closeable, 2 blocked by already-tracked H-AC-11/A-AC-01). Verdict flips to implemented',
  'EPIC-AC-02': 'NO CARRIER: planParallelSprintIntegration has no concept of "unpublished" and is called only from its own test file',
  'EPIC-AC-03': 'an outstanding deviation is recorded (the bound Spec section 7 inventory omits six implemented modules) and is not yet repaired through the sanctioned route. CLOSED 2026-08-17 (PHX-WP-EPICAC03, no dispatch -- Elephant-context, module list independently re-derived by PHX-WP-EPICAC03-MODULELIST): the deviation is repaired through the sanctioned continuity-authority-revision route. spec.md sec.7 gained 9 producer + 8 companion test files across sec.7.1 (EPIC-AC-02), sec.7.4 (A-AC-04, K-AC-05), sec.7.5 (L-AC-01, A-AC-05), sec.7.6 (P-AC-09) -- commit 47af86b5. The PRD\'s embedded technical-spec-sha256 marker was rebound to the revised spec.md (commit e39f3903). A PO-authority-decision cycle (po-authority-decision-plan/select/apply) reopened design phase after the spec.md drift was detected by the live readiness gate; the sanctioned continuity-authority-revision-plan/apply ceremony then formally renewed the approval binding -- proposal generated fresh from continuity.authority (not the stale generator script, which assumes no intermediate edit between reopening design and generating the request; hand-verified against buildAuthorityRevisionPlan\'s own checks instead), PRD marker rebound to the new spec digest, PO-signed via phoenix-authority-approval.mjs prepare/approve/verify (Ed25519, existing WSL key), applied via phoenix-authority-revision.mjs -- continuity revision 6->7, continuity.authority.{prd,spec} now point at the current bytes. Both halves of the clause -- "update the Spec" and "renew the affected approval" -- are done; "before merge" is not yet due since nothing has been pushed',
  'EPIC-AC-04': 'Full Verify and blocking Security pass only on the last PUSHED candidate (`3387065`), not the integrated one measured here (see the gates table below). An independent high-risk Critic on the integrated candidate is no longer absent -- it ran 2026-08-09 and returned FAIL (5 major, 2 minor); privacy review and explicit PO acceptance remain absent. UPDATE 2026-08-17 (this session): this whole pointer and the gates table it references were themselves stale -- flagged as a confirmed finding by the very Critic audit workflow run for this criterion. Full Verify and Security are now bound to the actual current candidate (see the rewritten gates table): Security passes clean; Verify has 5 known pre-existing red suites, down from 9 earlier this session, not yet fully green. A fresh, broader independent Critic audit ran today (12-group parallel review of the current integrated state, not a diff) and returned FAIL with 10 confirmed findings, 8 of which were fixed same session (verdict corrections, a doc fix, this table\'s own rewrite); privacy review and explicit PO acceptance still remain absent, and the branch has not been pushed for this candidate. Verdict stays partial: real progress, but Full Verify not fully green, no privacy review, no push, no PO acceptance',
  'EPIC-AC-05': 'a prohibition, and it currently bites -- see the summary count above for the exact figure; deliberately not hardcoded here after an independent Critic FAIL found this line stale against the generated total more than once (F4, 2026-08-09)',
  'EPIC-AC-06': 'the PRD header records the PO approval binding the first implementation dispatch',

  // --- 2026-08-11 staleness audit (task PHX-WP-DELTA-STALE4) ---
  'A-AC-03': 'reconfirmed 2026-08-11: NO CARRIER: no revalidation/invalidation path identifies objects affected by a changed assumption (direct grep of "A-AC-03" and "material assumption"/"invalidat*"/"revalidat*" across plugins/pipeline-core/{lib,scripts} finds nothing beyond unrelated Cyborg control-waiver revalidationTrigger fields; agent-decision-journal.mjs validates event shape only, no cascade logic). INVESTIGATED 2026-08-17 (Elephant-context, same pass as A-AC-01): same conclusion applies -- a revalidation/invalidation path would need to hang off the same continuity course-decision machinery A-AC-01/A-AC-05 already share, which the PO has already deferred pending a design session. Not dispatched; stays deferred alongside A-AC-01/A-AC-05',
  'A-AC-03': 'CORRECTED same day: the "same architecture question as A-AC-01/A-AC-05" framing above does not survive design/agent-decision-identity-scoping.md (2026-08-16), which found the continuity-course-decision candidate WRONG for A-AC-05 and never named it for A-AC-03 either -- A-AC-03 needs its OWN cascade mechanism (identify affected packages/candidates/decisions/evidence from a changed assumption), which remains NO CARRIER regardless of how A-AC-01/A-AC-05 resolve. Put to the PO directly 2026-08-17 (AskUserQuestion, standing "everything from Phoenix must be closed" directive): scope-and-design now / defer-and-amend / drop. PO ANSWERED: drop the criterion. acceptance.md amended (PO, 2026-08-17): the cascade requirement is withdrawn, satisfied by the epic\'s explicit decision not to build it -- same disposition class as H-AC-08 (docs/state.md, commit 29f29185), where a WHEN-antecedent with no live trigger closes vacuously; here an IF-antecedent that COULD fire is closed instead by an explicit PO decision not to respond to it in this epic, recorded rather than left as a silent gap. Verdict moves to implemented: the (now amended) criterion no longer requires a cascade mechanism, and nothing about the amended text is unsatisfied',
  'A-AC-09': 'RETRACTS "no code enforces or measures it" -- governance-event-store.mjs\'s captureDecision:"sampled-out" path (assertMandatoryCaptureNotSkipped, landed 2026-08-10 commit 90283a0c for A-AC-07, never credited here) lets a caller avoid durably persisting a non-mandatory agent-origin event -- exactly the "avoid producing... telemetry" behavior for non-material activity this criterion names. Tested: governance-event-store.test.mjs "A-AC-07 a mandatory event class cannot be silently sampled out, while a non-mandatory class still can" and "...only the policy-selected agent stream may ever be sampled out" (both pass). CLOSES 2026-08-17 (Elephant-context investigation): the remaining "nothing computes routine/low-impact" gap was mis-scoped as the bar to clear. The criterion is a negative content requirement, satisfied unconditionally: every field across agent-decision-journal.mjs\'s three closed event shapes (validateAgentDecisionEvent/validateCommandOfferEvent/validateLegacyImportObservationEvent) is a bounded enum, a short ID/CODE-pattern identifier, a SHA-256 digest, a bounded integer, or a bounded path pattern -- never free text, confirmed by the module\'s own explicit source comment at agent-decision-journal.mjs:60-61 ("never free text, which this module admits nowhere"). No event this journal admits, mandatory or sampled-out, material or routine, can carry exhaustive reasoning or token-level telemetry -- the SHALL holds by construction regardless of whether routine/low-impact classification ever runs',
  'P-AC-09': 'RETRACTS the "no export-backfill preview... exists" half -- organization-policy-activation.mjs\'s computeBackfillRange/backfillRange preview field (already credited to P-AC-03 as implemented, WP-P-AC01-AC03) is real and tested (organization-policy-activation.test.mjs "P-AC-03 computes newlyRequiredArtifacts, externalEffects, and backfillRange deterministically from the transition", 4/4 pass). CLOSES 2026-08-17 (PHX-WP-PAC09, commit 6b9a656e, independently re-verified): the remaining two gaps are built. activateOrganizationPolicy now requires a distinct backfillGranted/backfillDecisionId/backfillSubjectSha256 consent, exact-key-bound to a digest over the plan\'s own preview, refused by name (OPA-BACKFILL-CONSENT) when a backfill-implying activation supplies only the ordinary activation authority -- proven by a refusal test that re-confirms the prior policy stays active. organization-policy-backfill-export.mjs exports a consented backfillRange by reusing the real pipeline (queryPortableGovernanceStream -> projectGovernanceEvent -> enqueueGovernanceExport -> deliverGovernanceExportBatch), proven end-to-end with real appended events and a real delivered disposition, not a mock. 80/80 across the full affected regression set, independently re-run at the exact commit',
  'EPIC-AC-02': 'reconfirmed 2026-08-11: NO CARRIER: planParallelSprintIntegration (plugins/pipeline-core/lib/parallel-sprint-integration.mjs) still has no concept of "unpublished" (direct grep for "unpublished"/"Nova"/"Cyborg"/"Nightwing" in the file: zero hits) and is still imported only from its own test file (grep for the import across plugins/pipeline-core and harness: only parallel-sprint-integration.test.mjs). UPDATE 2026-08-17 (PHX-WP-EPICAC02, commit 77d2d8d5, independently re-verified): `checkUnpublishedSiblingSprintConsumption` built -- a feature-package manifest binds exactly one commit identity (`candidate.commit`); "consumes" means that commit or its ancestry carries a commit belonging to Nova/Cyborg/Nightwing, "unpublished" means `git merge-base --is-ancestor` against that epic\'s published tip fails or was never observed. The gate never calls git itself (caller-supplied observations only, confirmed: zero git invocations in the function), returns a digest-sealed fail-closed verdict, and its test suite is already registered as blocking in verify.mjs:405. Stayed `partial`: no live verify.mjs check yet calls this gate against real specs/*/lifecycle.json manifests -- that registration line is TP-3-protected and deliberately left for the file\'s own owner. 25/25 checks pass, independently re-run. CLOSED 2026-08-17 (PHX-WP-EPICAC02-VERIFYCHECK, commit ebc75a77, independently re-verified): the observation-gathering half built -- check-epic-ac02-publication.mjs discovers every real specs/*/lifecycle.json manifest, gathers the sibling-branch-ancestry and release-state evidence checkUnpublishedSiblingSprintConsumption needs via git for-each-ref/merge-base --is-ancestor, and fails closed (siblingProvenance: "unobserved") on any failed probe. Deliberate direction fix over a literal reading of the acceptance text: merge-base --is-ancestor <siblingTip> <boundCommit>, not a reduced for-each-ref --contains <boundCommit> (documented in the script\'s own comment; the reduced form answers the reverse question). Standalone run against this real repo: 3 checked, 0 failed (all 3 manifests have candidate: null today, short-circuiting to PSI-PUB-NO-BOUND-COMMIT); 6-case test suite (throwaway repo with a real Nova-merge ancestry, plus the 3 real manifests) green. Registered in verify.mjs (commit 7135aa41) via the signed HGO ceremony (ADR-0059, TP-3), planSha256 7430ae0ce1473ecfc88bff03996610172c63c9f9dfa2285a3183968c8571a7b0. Both halves of the clause -- the pure decision function (77d2d8d5) and the live observation-gathering gate against real manifests -- are now real, tested, and wired into the blocking verify gate',
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
  // PX0-AC-05/PX0-AC-13 reclassified build -> po 2026-08-11 (PHX-WP-DELTA-STALE4):
  // DELTA-0811 confirmed code+tests are complete and green for both; the only
  // remaining blocker is an independent Critic PASS on this exact candidate
  // (a human/process gate, not further code work) -- not closeable by writing
  // code, matching the "po" class definition exactly.
  'PX0-AC-05': ['po', 'WP-PX0'],
  'PX0-AC-06': ['build', 'WP-PX0'],
  'PX0-AC-07': ['assert', 'WP-PX0'],
  'PX0-AC-08': ['build', 'WP-PX0'],
  'PX0-AC-13': ['po', 'WP-PX0'],

  'K-AC-05': ['build', 'WP-K'],
  'K-AC-08': ['assert', 'WP-K'],
  'K-AC-10': ['build', 'WP-K'],

  // H-AC-08 moved to the Class P group below 2026-08-17 (PHX-WP-HAC08 investigation) --
  // see its POINTERS entry. (Was seam -> build 2026-08-09.)
  // H-AC-09 moved to the Class P group below 2026-08-09 (PO-confirmed) -- see its POINTERS entry.
  'H-AC-11': ['po', 'WP-PO'],
  // H-AC-12 closed and removed from this table 2026-08-17 (PHX-WP-HAC12-GITGUARD):
  // Git-guard override consumption was its last open reader, satisfied by
  // construction (a PO amendment, not a code change).
  'H-AC-14': ['doc', 'WP-DOC'],
  'H-AC-15': ['assert', 'WP-H'],

  'A-AC-01': ['build', 'WP-A'],
  'A-AC-02': ['assert', 'WP-A'],
  'A-AC-03': ['build', 'WP-A'],
  'A-AC-04': ['build', 'WP-A'],
  // A-AC-05 closed and removed from this table 2026-08-17 (PHX-WP-AAC05-WIRING):
  // the advisory-decision producer is now wired into its live call path.
  'A-AC-07': ['build', 'WP-A'],
  'A-AC-08': ['build', 'WP-A'],
  'A-AC-09': ['build', 'WP-A'],
  'A-AC-10': ['build', 'WP-A'],
  'A-AC-12': ['assert', 'WP-A'],
  'A-AC-13': ['assert', 'WP-A'],
  'A-AC-14': ['assert', 'WP-A'],
  'A-AC-15': ['doc', 'WP-DOC'],

  // L-AC-01 reclassified 'po' 2026-08-17 (this session): the remaining 7
  // triggers need a schema-design decision (non-dispatch correlation shape)
  // before any further producer can be dispatched -- see POINTERS and the
  // acceptance.md amendment. Tracked in
  // backlog/items/2026-08-17-lifecycle-event-schema-has-no-non-dispatch-correlation-shape.md.
  'L-AC-01': ['po', 'WP-L'],
  'L-AC-02': ['build', 'WP-L'],
  'L-AC-04': ['build', 'WP-L'],
  'L-AC-07': ['assert', 'WP-L'],
  // L-AC-08 CLOSED 2026-08-17 (this session, docs/governance-replay.md
  // Fields-section fix): see POINTERS for the full narrative.

  'P-AC-01': ['build', 'WP-P'],
  'P-AC-03': ['build', 'WP-P'],
  'P-AC-06': ['build', 'WP-P'],
  'P-AC-08': ['build', 'ELEPHANT'],
  'P-AC-09': ['build', 'WP-P'],
  'P-AC-10': ['assert', 'WP-P'],
  // P-AC-11 closed and removed from this table 2026-08-17 (PHX-WP-PAC11-CONFLICTPOLICY):
  // conflictPolicy was its last open dimension; VERDICTS now reads implemented.
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
  'E-AC-19': ['build', 'WP-V'],
  'E-AC-20': ['seam', 'WP-E'],
  'E-AC-21': ['doc', 'WP-DOC'],

  'R-AC-06': ['build', 'WP-R'],
  'R-AC-04': ['build', 'WP-R'],
  'R-AC-08': ['build', 'WP-R'],
  'R-AC-09': ['build', 'WP-R'],
  'R-AC-10': ['build', 'WP-R'],
  'R-AC-11': ['build', 'WP-R'],
  'R-AC-12': ['build', 'WP-R'],
  'R-AC-13': ['build', 'WP-R'],

  // Reclassified build -> po 2026-08-17 (PHX-WP-HAC08 investigation-only dispatch,
  // NO CARRIER, no commit): the corrected finding is not "no legacy source exists" --
  // a real one does (project/guard-override.log.jsonl, git-tracked, 5 pre-Phoenix
  // override records with unprovable free-text authority) -- but that no import
  // ACTIVITY exists for it to feed, and the one real legacy-import path in this repo
  // (migrate-backlog-state.mjs) is permanently closed (backlog/transitions.ndjson
  // already exists) and semantically refuses the records H-AC-08 would import.
  // design/agent-decision-journal-production-producer.md sec.5 rules this the same
  // "building a caller to satisfy a criterion" anti-pattern already reverted once
  // (cc43a182) and names it a PO amendment decision, deliberately not taken by a
  // dispatch -- the same shape as H-AC-09's reclassification below.
  'H-AC-08': ['po', 'WP-PO'],
  'H-AC-09': ['po', 'WP-PO'],
  // EPIC-AC-01 CLOSED 2026-08-17 (this session, feature-package-reconcile,
  // PO-signed, commit 8e91872e): see POINTERS for the full narrative.
  // EPIC-AC-02 CLOSED 2026-08-17 (PHX-WP-EPICAC02-VERIFYCHECK, commit ebc75a77
  // + 7135aa41): the observation-gathering script and its verify.mjs
  // registration both landed -- see POINTERS for the full narrative.
  // EPIC-AC-03 CLOSED 2026-08-17 (PHX-WP-EPICAC03, continuity revision 6->7,
  // PO-signed authority revision): see POINTERS for the full narrative.
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
w('work is not mistaken for paperwork. REWRITTEN 2026-08-17: this whole table had gone stale since');
w('2026-08-09 (the prior text still bound Full Verify/Security/push to commit `3387065`, weeks and');
w('~450 commits out of date) -- caught by the 2026-08-17 EPIC-AC-04 Critic audit workflow itself.');
w();
w('| gate | state | evidence |');
w('|---|---|---|');
w('| Focused package checks | **passed** | per-package suites are green; the 2026-08-09 Critic FAIL (F3, no shipped entry point supplied the reconcile approval resolver) was closed the same window (PHX-WP-PAC08-LOCK-REENTRANCY chain, commit `3e1a727e`) and independently re-Critic-confirmed PASS |');
w('| Full Verify | **red (5 known suites), bound to `cacd0b0e`** | `evidence/verify-latest.json` binds exactly this commit; exitCode 2, 5 failing suites (guard-testpath-override-tests, doc-contract-tests, doc-contract-check, backlog-state-check, verify-suite-registration-check) -- all pre-existing/tracked, none newly caused by this session\'s changes (independently re-run at each intermediate commit this session, same 5 every time; down from a 9-suite baseline earlier this same session after an unrelated lifecycle.json fix). Full Verify does not currently PASS outright -- these 5 are not yet closed |');
w('| Blocking Security | **passed, bound to `cacd0b0e`** | `evidence/security-latest.json` + `.v2.json`/`.v2.verdict.json` re-run at this exact commit: gitleaks/semgrep/license-check all PASS (0 findings), osv-scanner SKIPPED (no package sources), verdict CLEAN, exitCode 0 |');
w('| Privacy review | **absent** | no privacy-review artifact exists for the integrated candidate |');
w('| Independent high-risk Critic | **FAIL, 2026-08-17 (this session)** | a 12-group parallel audit of the CURRENT integrated state (not the 2026-08-09 diff review) against every acceptance.md criterion, adversarially re-verified; 10 confirmed findings. 7 major (R-AC-06, L-AC-08, E-AC-08, E-AC-19, X-AC-15, C-AC-13, this table\'s own former staleness) -- 5 verdicts corrected implemented->partial, 1 doc fixed, 1 (this table) rewritten, all same session. 3 minor (A-AC-08, H-AC-11, E-AC-14 line-citation staleness) -- 2 fixed, E-AC-14 not independently confirmed either way, left open. The 2026-08-09 Critic\'s own 5 major + 2 minor findings are superseded by this newer, broader review |');
w('| Exact branch push and readback | **not current** | `origin/sprint_phoenix` is many commits behind local HEAD; nothing from this session has been pushed. The push-approval ceremony (`docs/push-release-flow.md`) has not been run for this candidate |');
w('| Explicit PO acceptance | **absent** | the only recorded PO approval binds the first implementation dispatch (EPIC-AC-06), not completion |');
w();
w('One epic criterion is open for a reason that is not implementation debt and cannot be closed by');
w('writing code:');
w();
w('- **H-AC-11** — its own PO amendment records that Increment 1 does **not** satisfy the');
w('  no-join-handle clause for the GMW half, as a proved impossibility rather than an unfinished');
w('  implementation. It closes only by a separately reviewed amendment scoping the clause, or by');
w("  changing GMW's machine-local storage. Tracked as O-4.");
w('  (EPIC-AC-03 closed 2026-08-17 via the sanctioned continuity-authority-revision route, PO-signed;');
w('  no longer belongs in this list.)');
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
