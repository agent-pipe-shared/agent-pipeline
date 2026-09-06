---
schema: pipeline.backlog-item.v1
id: pipeline.orchestrator-added-file-undisclosed-in-dispatch-commit
type: defect
owner: pipeline
status: open
created: 2026-09-06
sprint: nova-b
done_when: manual
tracking: "Nova B -- a commit carrying a Dispatch: trailer can legitimately contain files the dispatch did not write (an EL-01-permitted orchestrator append, e.g. a governance registry line added at commit time). The dispatch record's changedFiles then under-reports the commit's file set, and there is no field in which the orchestrator's own addition can be disclosed. A Critic comparing git show --stat against the record sees an unexplained discrepancy and must reason its way to the benign reading."
source: "T1 Critic round-2 finding F-D on NVA-B-PARALLELSLICING-DESIGN-1, 2026-09-06: commit 9e40548b carries governance/observation-doc-governance.json (+1) alongside the draft; the stripped record lists only the draft and its own evidence file."
---

# An orchestrator-added file in a dispatch-trailered commit has nowhere to be disclosed

## The gap

A dispatch record's `changedFiles` describes what the *dispatch* changed. The
`Dispatch:` trailer, however, is attached to a *commit*, and the orchestrator
may legitimately add files to that commit before making it — `roles/elephant.md`
EL-16 names register and ADR entries among the outputs an Elephant's own diffs
may contain, and an observation-governance registry line is exactly that class.

The two are then inconsistent with no place to say so. `git show --stat` on the
commit lists a file the record does not, and `dispatch-authorship-verify.mjs`
has no field distinguishing "the dispatch wrote this" from "the orchestrator
added this at commit time". The reviewer's only route to the benign reading is
inference from `Commit-Act: orchestrator` plus a judgment about which file
classes EL-01 permits.

## Why it matters

The dispatch record is the *only* authorship evidence an independent Critic
has. A discrepancy that always requires reasoning-to-benign is a discrepancy
that will eventually be reasoned-to-benign when it is not benign.

## Confirmed instance

- Commit `9e40548b`: `docs/adr/draft-parallel-dispatch-slicing-enforcement.md`
  (+562, dispatch-authored) and `governance/observation-doc-governance.json`
  (+1, orchestrator-added registry append).
- `scratch/dispatch-slicing-record-stripped.json` lists the draft and the
  record's own evidence file; the registry file appears nowhere.
- The record shows `"commits": []` and the commit carries
  `Commit-Act: orchestrator`, so nothing was concealed — but nothing was
  disclosed either.

## Not yet decided

Whether the fix is a record field (`orchestratorAddedFiles`), a verifier rule
that admits a known-permitted class, or a convention that the orchestrator
commits its own appends separately. All three have costs; the last one
multiplies commits for one-line register updates.
