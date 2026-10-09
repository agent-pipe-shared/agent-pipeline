# Existing four-round terminal binding: metadata completion plan

Audit candidate: `3dc9beac66d3067105945d9affab2a93fab91797`.
Scope: source/evidence observation and metadata planning only. No fifth Reader,
new course, public-document patch, record, disposition, or provenance claim was
created. Independent review and PO acceptance remain pending.

Machine evidence is `reader-terminal-binding-audit.txt`, produced by
`node plugins/pipeline-core/scripts/capture-evidence.mjs --out specs/sprint-alfred-epic/evidence/wsl-intake-2026-10-09/reader-terminal-binding-audit.txt --label reader-terminal-existing-evidence-audit -- node scratch/reader-terminal-audit.mjs`.
Wrapped exit code: 0. Recomputed historical snapshots and eight unique immutable
public first publications passed. The embedded binding check is RED because
the committed `record.json` is absent. Snapshot success is not review success.
No setup refusal occurred. No Git mutation occurred; nothing committed.

## Historical identities and actual scope

All historical scope arrays were parsed as literal data from the committed
checker; no historical code was executed. The full coverage/input digests and
report publication commits/digests are in the machine capture.

| Round | Reviewed commit | Tree | Documents | Docset SHA-256 |
| --- | --- | --- | --- | --- |
| round-20260923a | 9e1851d41e50888ba7b3d76c080ab78da39f23af | e948c2b681be842f2bac0ca9edbc3f05a120faa8 | 15 | 3c9150c6d55a781ea859772f51914f49d1fa89d7d59709cd9bde8bcf4227a3ed |
| round-20260924a | e11caafa749725b98a7830c81a6ce2b49d415fa9 | 8a7dfbc9cddbe68d63234c004fe9ac1fa55a100b | 16 | 346b042c7490f4687327b008b2d25474e47c61b269c83b690635ad41dcd3a2c1 |
| round-20260927a | 1f1b5ed603e1046de602479cb0066a0548b271ed | 554246449eaea3e0ea97bbff80fc61828b80d0ba | 16 | 282a3d9c1997d98010b3dd5595d3ae6ebafda9466bd537a8d18579e01be9398c |
| round-20260927b | c3ff4084872ff5351b37e0438a932573479fb3c3 | 8012e767dfd3e4729adbe6ae3b4ddbf03a9f6c48 | 16 | 25cc0a319ac951f06a4ef21ba213b482f1b626a187a4c97a631ca14beea17c34 |

Round one excludes `PIPELINE_FLOW.de.md`; later rounds include it. Do not
retroactively give round one sixteen-path coverage. Round one's abbreviated
phase-two candidate resolves uniquely in Git. Round three's commit is the
handover's latest snapshot and its digest matches the reconstructed snapshot;
neither phase report explicitly names its reviewed commit. Preserve that
identity-evidence limitation until original dispatch evidence establishes it.
All four are described historically as complete reviews. Use `complete` for
rounds two/four rather than inventing a corrections-only scope.

## Exact correction intervals

These are the checker's covered-document/input history, not an assertion that
every included commit is an editorial correction. Evidence-only commits are
excluded. Commit lists are chronological and exhaustive for these endpoints.

1. Round one to round two:
   `18bdaf9c6c1e557ab5290b9a6c6953c67e6cb761`,
   `e11caafa749725b98a7830c81a6ce2b49d415fa9`.
2. Round two to the handover's round-three snapshot:
   `e2713f8c7c0001adb046e718f2f7e5b38b0ccc5d`,
   `01602d9e4f1287d62508ec6ef669210721e77a70`,
   `b10a5b7c3a124e109f585560f81cae8ba7c47535`,
   `f6ee2e97c7207ccb11feeafbb6ad8d0d0937fd3e`,
   `ef471b03f5115e9cf6317bce3e3f0fd73534402c`,
   `15c963efe044ac98be96b67c756f538acdb043d7`.
3. Round three to round four:
   `d2df7b61ddb287b392fcddfe90a5db2b0d4334c9`.
4. Round four to the recorded terminal correction:
   `641b6d17dc00ee0d657febef435a072595c888e8`.

The terminal snapshot digest is
`68234a63f33f959a479916acd42c4d2bd6d047927f6d28e365595cd7da3f62cd`.
The audit candidate's current digest is
`8c4341454340982bcbaa9d7ac9d91a018c74ed5b2ce679b29e317841f8e60a9c`.
Eighteen subsequent covered-document/input-changing commits are enumerated in
the capture. Current `SETUP.md`, `docs/enforcement.md`, and
`docs/sprint-alfred-completion-report.md` differ from terminal bytes. Inventory,
governance, and protocol all differ too. Selecting the terminal state as
`final` fails candidate equality; moving `final` to the current candidate fails
the fourth-round inventory/governance equality rule. These are reached facts,
not a simulated successful terminal record.

## Publication and owner evidence

Each of the eight reports has exactly one reachable full-history change and
one addition; its current digest equals that first publication's digest.
Preserve those reports byte-for-byte. Round-four phase one explicitly declares
a public path-normalized copy; its private raw SHA-256 is not declared. The
handover says raw round-four reports remain in ignored scratch. The other
seven public reports do not declare raw versus normalized publication. Public
immutability alone cannot prove equality to original raw bytes. Original raw
artifacts and host provenance are required before selecting publication kinds
or `rawSha256`; absence is an evidence blocker, not permission to infer `raw`.

Existing owner source:
`specs/sprint-alfred-epic/evidence/reader-review/course-decision-request-2026-09-27.md`,
SHA-256 `24b40227c16a9438704a375e08f5b6ad0bbb4b327bffd9b02a3da45fb592db8f`.
Its recorded clarification authorizes one terminal correction batch and
prohibits another two-stage review. The source was introduced at
`ae6e23352a30030e4ea80e1379162f65b09f9e9a` and updated at
`641b6d17dc00ee0d657febef435a072595c888e8`. A later owner JSON must bind this
existing decision and round-four commit; it creates no identity/signature
assurance and requires no invented fresh owner approval.

## Finding inventory and resolution evidence limits

The following are audit labels, not new reader finding IDs or dispositions.
They retain the original semantic findings; exact JSON IDs must be assigned
transparently during later metadata preparation.

Round one phase two carries six groups: runner installation/start ordering;
exceptional/stale V3 material; bilingual flow separation/parity; German README
decision ownership; README architecture weighting; README language ordering.
Its challenged phase-one proposals are Setup entrance duplication, Usage
architecture placement, Enforcement matrix, Audit threat model, timings,
Overview release matrix, and completion-report archival. Record the challenges
as actual phase-two adjudication, not silent omissions or fabricated owner
acceptances. The first interval visibly adds the GEMINI start action, separates
German flow, changes German recommendation ownership, relocates architecture
material, aligns README ordering, and moves runner installation/removes the
stale candidate label. The exceptional Codex material is substantially cut in
the *second* interval. An exact within-batch resolution or existing owner
acceptance for that round-one group is therefore not yet established.

Round two has five carried findings: German navigation cue; fresh-root handoff;
Audit implementation detail; missing-prerequisite audience; V3 internal storage
and test material. The second interval visibly corrects the navigation cue and
cuts/references V3 internals. Endpoint diff inspection is insufficient to assign
each exact resolving commit within its six-commit batch; all five assignments
remain metadata work. Do not use the endpoint snapshot commit by default.

Round three's five findings have direct resolution evidence in
`d2df7b61ddb287b392fcddfe90a5db2b0d4334c9`: final Verify in both flow diagrams
and tables (fileline); skill inventory move (reordering); licensing outlook
move (reordering); Track C before D (reordering); Nova implementation versus
acceptance wording (fileline).

Round four's five findings have direct resolution evidence in
`641b6d17dc00ee0d657febef435a072595c888e8`: Antigravity setup details moved
behind common steps (reordering); F0/F0A bridge before the status table
(fileline); security/Verify sequence aligned in Usage (fileline); repeated
flow/Usage status detail condensed with Overview links (cut); German route and
skill context supplied before profile selection (fileline). README itself was
not changed in this batch. This records the actual editorial patch and the
owner's recorded assertion, not a fresh reader verdict or proof of semantic
completeness. There are no existing structured finding dispositions or exact
accepted-finding keys to import.

## Closed completion sequence for the coordinator

1. Preserve the four immutable report pairs and historical scopes. Establish
   round-three reviewed-commit evidence from the original permitted dispatch
   material; retain the handover limitation if unavailable.
2. Recover original raw report digests and actual publication declarations
   without publishing private bytes. Never rewrite the first public copies.
3. Reconcile every original phase-one and phase-two finding, including the
   challenged round-one proposals. Confirm exact per-finding resolution commits
   within the enumerated batch; identify any existing explicit owner acceptance.
   A later-round fix cannot be relabeled as a round-one correction commit.
4. Diagnose the measured candidate/terminal and fourth-input drift under the
   existing contract. This audit authorizes neither covered-document rollback,
   scope reset, fifth review, new course, nor checker weakening. Metadata alone
   cannot eliminate the inventory/governance mismatch; retain it as a blocker.
5. Only if those facts permit validation, coordinator prepares four nonempty
   terminal dispositions and source-bound owner JSON, commits metadata evidence,
   and publishes the terminal record last. Bind actual snapshots, correction
   commits, provenance, acceptance keys and any actual protocol transition.
   Record/schema preparation is outside this dispatch.
6. Run the exact committed candidate checker and preserve its actual result.
   Keep release qualification, independent review and PO acceptance separate.

No binding-readiness claim follows from this plan. Remaining blockers are
candidate/input drift, undeclared original publication provenance, round-three
identity evidence, exact first/second-round resolution assignments (including
the cross-batch exceptional-material finding), and absent structured metadata.
