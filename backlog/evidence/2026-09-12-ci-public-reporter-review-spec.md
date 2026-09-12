---
schema: pipeline.review-spec.v1
id: pipeline.ci-public-log-boundary
source: docs/adr/0084-ci-failure-reporter-public-log-boundary.md
---

# CI public failure reporter review specification

## Required behavior

- The failure reporter is reachable from the Verify workflow only after Verify
  has failed. Reporter failure remains visible but its process exits zero so it
  cannot add a second gate after the substantive failure.
- Public output uses a closed JSONL schema. It may contain a suite identifier
  only when that exact identifier appears in the current candidate's
  repository-authoritative Verify inventory, a bounded exit status, safe typed
  attribution, and a digest reference to separately protected private evidence.
- Character shape alone never classifies a value as safe. Unknown suite names,
  malformed evidence, parser failures, and unavailable inventory emit only a
  fixed notice with an explicit `[REDACTED-UNCLASSIFIED]` marker.
- Raw or sanitized free-text log excerpts, exception messages, filesystem
  paths, credentials, personal identifiers, and unclassified evidence fields
  never cross the public-log boundary.
- Output volume, file size, path traversal, symlink, duplicate, and malformed
  evidence cases fail closed under explicit bounds.
- Consumers branch on the declared JSONL schema and kind; unknown versions are
  unsupported and unknown fields are not rendered as text.
- A safe rollback disables the structured reporter or emits a fixed redacted
  notice. It does not restore the former raw log-tail behavior.
- Adversarial tests cover token-, user-, and session-shaped suite canaries,
  malformed and missing inventory, raw-log withholding, exception paths,
  bounds, and the non-gating wrapper.

## Final-candidate ceremony

The frozen final candidate requires Privacy and Threat-Model signatures for
this public declassification boundary. The implementation and review must not
fabricate or substitute those signatures.

<!-- pipeline.backlog-item-strip-for-dispatch.v1: implementation, closure,
review and evidence prose intentionally omitted -->
