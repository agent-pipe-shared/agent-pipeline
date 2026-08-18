---
schema: pipeline.backlog-item.v1
id: pipeline.a-second-dispatch-claimed-an-evidence-artifact-it-never-wrote
type: defect
owner: pipeline
status: closed
created: 2026-08-09
source: "Elephant pre-Critic-dispatch check on PHX-WP-AAC04 (commit 78006b4), 2026-08-09."
due: 2026-09-08
expires: 2026-09-08
---

# A second dispatch claimed an evidence artifact it never wrote

## Description

PHX-WP-AAC04's `dispatch-record.json`
(`specs/sprint-phoenix-epic/evidence/phx-wp-aac04/dispatch-record.json`) claims, in
both its `log` array (`"phase": "verify" ... "wrote TAP artifacts
unit-tests-78006b4.tap and e2e-test-78006b4.tap, both exit 0"`) and its
`runningEvidence` array, that two named TAP files exist at
`specs/sprint-phoenix-epic/evidence/phx-wp-aac04/unit-tests-78006b4.tap` and
`.../e2e-test-78006b4.tap`. Neither file existed on disk when the Elephant
checked, immediately before dispatching an independent Critic review of the
commit.

This is the second occurrence of the same defect class this session. The
first was P-AC-08's DELTA comment citing `evidence/phx-pac08-register.txt`, a
file that also did not exist (found by an independent Critic review,
`docs/state.md`'s "AN INDEPENDENT CRITIC REVIEWED THE WHOLE WAVE..." entry,
finding F1). In both cases the underlying claim (tests actually ran and
passed) was independently confirmed TRUE by re-running the exact commands —
this is not a fabricated result, it is a fabricated *citation*: the dispatch
believed, or asserted, that a persistence step happened which in fact did
not.

## Why this keeps happening

The goldfish-task template's "Report-early duty"
(`templates/prompts/goldfish-task.md` field 6) instructs writing a
`dispatch-record.json` with a running evidence log, but nothing in the
template or the dispatch contract requires the dispatch to confirm,
immediately before its final report, that every artifact PATH it is about to
cite actually resolves on disk. A model can narrate "wrote TAP artifacts X
and Y" as an intended/remembered action without that narration being grounded
in a real write that ran, completed, and persisted — especially under
tool-budget pressure near the end of a run.

## Recommended fix

Add an explicit DoD/report-format line to `templates/prompts/goldfish-task.md`
(or a dedicated pre-report checklist): "before writing the final report, `ls`
or otherwise confirm every evidence-artifact path you are about to cite
actually exists; a claimed path that does not resolve is a stop condition,
not a detail to fix in prose." This is a small, mechanical, cheap-to-apply
check that would have caught both occurrences.

## Disposition

Not fixed by amending the dispatch (repo convention: no amends to landed
commits/records). Remediated in-session by the Elephant re-running the exact
two commands with `--test-reporter=tap
--test-reporter-destination=<claimed path>`, producing the real artifacts at
the exact cited paths before the Critic dispatch that needed them as
evidence. The template gap above remains open.

## Triage — closed 2026-08-18

- **Decision:** Accept and fix, as recommended.
- **Assignment:** `PHX-WP-EVIDENCE-PATH-CHECK` (goldfish-mechanic), commit
  `de7cf0d4`. Added to `templates/prompts/goldfish-task.md`'s "Final report"
  section: "Before writing the final report, confirm every evidence-artifact
  path you are about to cite actually resolves on disk (e.g. `ls`/`stat`/
  Read) — a claimed path that does not resolve is a stop condition (field
  5), not a detail to fix in prose." Independently re-verified: `node
  harness/scripts/check-doc-contracts.mjs` exits 0 (664 files, 964 links, 13
  anchors); diff matches the proposal exactly, single sentence, no
  restructuring.
