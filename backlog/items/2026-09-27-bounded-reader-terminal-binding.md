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
