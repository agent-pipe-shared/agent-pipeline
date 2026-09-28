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

- **Decision:** pending
- **Assignment:** Alfred release preparation
- **Date:** 2026-09-27

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
