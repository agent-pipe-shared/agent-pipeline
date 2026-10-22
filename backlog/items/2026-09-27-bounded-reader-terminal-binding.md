---
schema: pipeline.backlog-item.v1
id: pipeline.bounded-reader-terminal-binding
type: requirement
owner: pipeline
status: open
created: 2026-09-27
sprint: alfred
done_when: manual
source: "Documentation-owner 2+2 course decision, 2026-09-27; source Reader skill, harness/reader-review-protocol.md, check-doc-reader-binding.mjs and release-preflight reader gate."
---

# Bind a terminal Reader correction without another review loop

The documentation owner requires a bounded 2+2 Reader course: four two-stage
rounds at most, with one final correction batch after the fourth round and no
fifth dispatch. The source skill records that rule. The source protocol and
binding checker currently accept only a document state identical to the last
reviewed state, so the terminal correction cannot qualify a 0.7 release even
when all fourth-round findings are resolved.

## Required behavior

- Align the source protocol, release instructions, and skill on the bounded
  course, including correction-focused rounds and early closure.
- Define a closed terminal-course evidence form binding all four reports,
  reviewed commits, fourth-round findings, exact resolution commits, and final
  document/input hashes. Preserve immutable reader reports and honest host
  assurance. A terminal correction must not be misrepresented as freshly read.
- Make the committed source checker and release preflight accept that form only
  when every finding has a recorded resolution or explicit owner acceptance,
  the course bounds are met, and no covered input drifts after final closure.
  Keep malformed, missing, or invented evidence fail-closed.

## Acceptance

A fixture with four rounds and a fourth terminal correction passes without a
fifth reader; an unresolved finding, fifth round, mismatched commit/digest, or
changed covered document fails. The current Alfred course can bind its actual
four reports and final correction without fabricating a fresh Reader verdict.

## Triage

The latest manual quality review identified report overwrite followed by
byte-identical restoration as an endpoint-only binding gap. The Source checker
now rejects intermediate report changes through exact candidate Git history;
the real-Git restoration regression and original corpus pass9/9. No fifth
Reader was launched. Bounded correction review and the final Alfred binding
remain distinct obligations; no release acceptance or item closure is claimed.

- **Decision:** accepted (D66, 2026-10-20, `specs/sprint-alfred-epic/plans/po-decisions-2026-10-18.md`, AC-118): a
  report-bound `adjudicated-no-change` disposition form for the seven phase-two no-change adjudications; the two
  remaining findings (the carried relocation and the partly evidenced terminal finding) are corrected by
  documentation commits and bound; no fifth Reader, no inferred owner acceptance. The form exists in
  `harness/scripts/doc-reader-terminal-binding.mjs` (status `adjudicated`, quotes bound to the immutable
  phase-two report) and is pinned by `plugins/pipeline-core/lib/pins/bounded-reader-terminal-binding.test.mjs`.
  The item stays open: the actual Alfred terminal record is not built (see "Terminal record attempt 2026-10-22").
  The owner acceptance and the policy-transition field remain unset for the PO.
- **Assignment:** Alfred release preparation
- **Date:** 2026-09-27 (opened), 2026-10-22 (decision recorded)

## Preparation evidence (2026-09-28)

`scratch/reader-terminal-source.patch` prepares a separate closed terminal
record, the committed checker branch, candidate-matching release dependency
readback, source protocol/skill instructions, canonical tests and Verify
registration. The unchanged-state v1 path remains available for early closure.
The terminal record distinguishes the fourth reviewed snapshot from the final
editorially corrected snapshot and does not assert a fifth or final fresh review.

Eight tests using exact proposed checker functions over real committed
synthetic Git repositories pass. They exercise four rounds plus final correction,
declared policy/report normalization, extra fifth reports including subsequent
deletion, open or invented resolutions, post-closure document/governance drift,
explicit owner acceptance, omitted correction commits, rewritten immutable
reports and duplicate-key records. This is a synthetic contract test, not an
Alfred Reader verdict or an assertion of human/reader identity.

The combined `scratch/0.7-virtual-integration.patch` now includes the Reader
connection and has 53 proposed files; all 45 proposed JavaScript files pass
syntax checks, relative dependencies resolve and Git dry application passes.
`scratch/reader-terminal-preparation-evidence.json` binds preparation bytes
and the observed test result. No canonical implementation was changed.

The actual Alfred course still needs its exact historical reviewed states,
all eight report references and their honest publication provenance, complete
finding dispositions, actual resolution commits, owner-policy/decision source
and the eventual protocol transition. Productive integration, canonical tests
and release qualification remain pending; this item stays open.

### Actual course reconstruction

The read-only Git audit in `scratch/alfred-reader-historical-audit.json`
resolves four reviewed states and verifies all eight public report blobs are
unchanged since their first publication. Their correction intervals contain
2, 6, 1 and 1 covered-input commits. The current covered document/input digest
equals the final editorial correction at `641b6d17`.

The actual first round used a 15-document scope; `PIPELINE_FLOW.de.md` was
added before round two. This exposed a mismatch in the first prepared terminal
implementation, which used today's 16-document set for every historical round.
The proposal now parses each round's literal committed checker scope as data,
without executing historical code. Its actual covered bytes and digest are
bound separately; final/candidate coverage retains the current fixed set.
A ninth real-Git fixture passes for the 15-to-16 transition and rejects a
fabricated earlier review of the later-added document.

The fourth public phase-one report differs from its private raw source and
discloses normalization; phase two is byte-identical to its retained raw source.
Only private digests are recorded, not raw private report bytes. Individual
finding/disposition reconstruction and the final committed policy transition
still remain; this audit is not a passing Alfred Reader binding.

### Finding reconciliation

Three read-only historical tasks mapped all 30 distinct reported findings to
their phase-two adjudication and covered Git intervals. The complete matrix is
`scratch/alfred-reader-finding-reconciliation.md`: 21 concrete corrections,
seven explicit phase-two challenges, one carried relocation without its
requested correction in that round, and one partly evidenced terminal finding.
The round-two consumer cut is proven; relocation of every removed internal
note into the linked threat model is not proven and must not be asserted.

The proposal's current resolved/owner-accepted disposition form cannot encode
the seven legitimate phase-two no-change adjudications. Prepare a narrowly
report-bound adjudication form, retaining unresolved or partial findings as
non-passing. Do not infer owner acceptance, fabricate resolution commits,
restart the bounded course, or launch a fifth Reader. Actual Alfred binding
remains pending even though all eight report blobs are immutable.

### Terminal record attempt 2026-10-22

The historical inputs exist and were re-checked: the four reviewed commits, the eight immutable reports under
`specs/sprint-alfred-epic/evidence/reader-review/{phase-one,phase-two}/` and the correction commits of each interval. The
terminal record was nevertheless NOT built, because a record that passes the committed checker cannot be built honestly
from them today. Measured against the live repository:

1. Two findings have no supported disposition. Round 1 finding 7 (Codex host contract relocation) and round 4 finding 4
   (retained README availability passage) are neither resolved by a commit in their own correction batch, nor
   phase-two adjudicated, nor owner accepted. D66 closes them by documentation commits (not yet made); the owner
   acceptance stays unset for the PO.
2. The covered state moved after the terminal correction `641b6d17`. Nine commits since then changed covered documents
   (`99e0fba95`, `e779200cf`, `030a6111f`, `69c4d0bd1`, `3c0396bb0`, `d02409a8a`, `101ed4ef5`, `96ccb175e`,
   `15722ce6a`) and none was read by a Reader; listing them as correction-batch commits would present unreviewed changes as
   reviewed corrections.
3. `docs/product-capability-inventory.json` changed in more than twenty commits after the fourth reviewed commit
   `c3ff4084`; the checker refuses an unreviewed inventory transition (`unreviewed inventory or governance transition`).
4. The per-round disposition files, `owner-decision.json` (needs the owner's name and decision) and `record.json` do not
   exist in the repository. The owner decision source `course-decision-request-2026-09-27.md` does.

No checker run was made over a record, since none was written. The next step needs a PO decision on points 2 and 3
(re-baseline the course on a freshly reviewed state, or bound the post-course changes), plus the two documentation
commits of point 1. Owner acceptance and the policy-transition field are left unset.

### Blocker analysis 2026-10-22

Read-only survey of the open clauses that the delivery remeasure assigned to native-host, verify-wsl, po-decision or po-signature (evidence: `specs/sprint-alfred-epic/evidence/blocker-analysis-2026-10-22/`). Status key: LINUX-RUN and WINDOWS-INTEROP-RUN are runs an agent can do from the WSL host; HOST-SESSION-NEEDED, PO-DECISION and PO-SIGNATURE are not agent work.

- **NOT-BLOCKED** — Triage decision and owner-policy source for the terminal correction are still pending
  The decision is on record: D66 (2026-10-20, po-decisions-2026-10-18.md line 93, AC-118) takes a report-bound adjudicated-no-change disposition form for the seven phase-two adjudications, corrects the two remaining findings by documentation commits, and allows no fifth Reader and no inferred owner acceptance; the owner-policy source is the documentation-owner 2+2 decision of 2026-09-27 named in the item. The Triage 'pending' text is stale; remaining work is agent implementation and binding.
