# Neutral findings registry — NVA-B-PARALLELSLICING-DESIGN-1, round 2

Source: T1 Critic review (opus, max; functional-equivalent-read-only),
closing round under the two-round cap, of commits
`9e40548bb7a00a7041a4962e5eafe9444697dfad`,
`4876185d40c38839d99716d952532960b4f785a8` and
`f17a63d17c8024b774dd9d9f812608738ce60b92`. Verdict: PASS, bounded by the
design's own blocking step 1.

- **F-A** (major): PSP-3's justification cites two incidents that do not
  support it — one whose own trigger was a PSP-1 breach, and one that does
  not appear in the cited item at all. Two occurrences in the same item do
  support it and were not cited.
- **F-B** (minor): the normative Decision section still carries the
  `additionalContext` claim that round 1's F2 corrected in the risk table.
- **F-C** (minor): two decisions the body declares must-be-fixed-before-build
  are absent from the ordered Next steps a briefing is assembled from.
- **F-D** (minor): the stripped dispatch record's `changedFiles` does not
  account for one file in the commit carrying the dispatch trailer.

## Disposition

The two-round cap is exhausted; the Elephant self-verifies from here.

F-A, F-B and F-C are corrected in the same commit as this file. Each
correction is recorded in place, dated, and states what the previous text
claimed — the register is the diff plus these in-document notes, not a
separate remediation narrative.

F-D is recorded, not corrected. The gap is real: `git show --stat 9e40548b`
carries `governance/observation-doc-governance.json` (+1) alongside the
draft, and the stripped record lists only the draft and its own evidence
file. It is not correctable after the fact without rewriting either history
or a sealed dispatch record, and the Critic's own reading is the correct one:
the record is accurate for what the *dispatch* changed, and the one-line
registry append is an EL-01-permitted orchestrator output made at commit
time. The underlying convention gap — an orchestrator-added file in a
dispatch-trailered commit has nowhere to be disclosed — is filed with an
owner as
`backlog/items/2026-09-06-an-orchestrator-added-file-in-a-dispatch-trailered-commit-has-nowhere-to-be-disclosed.md`
rather than left as a floating note, which is the QG-06 shape that produced
round 1's F1.
