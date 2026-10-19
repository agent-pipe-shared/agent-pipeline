---
schema: pipeline.backlog-item.v1
id: pipeline.owned-gitignore-without-evidence-breaks-every-item-governed-host-commit
type: defect
owner: pipeline
status: open
created: 2026-10-19
source: "PF-26C diagnosis (2026-10-19): the second PF-26 cause in the end-to-end pin fixture"
sprint: none
done_when: manual
---

# Owned .gitignore without /evidence/ breaks every item-governed host commit

## Description

For an item-governed native Goldfish dispatch, the dispatch guard writes
`evidence/dispatch-route-<slice>.json` after the host-commit baseline is captured. If the
consumer's `.gitignore` does not ignore `/evidence/`, that file counts as a new untracked path.
At completion the host then refuses with `AGY-HOST-COMMIT-PATH-MISMATCH`, because the actual
changed paths no longer equal the paths the child claimed. Onboarding seeds `/evidence/`
(`PROJECT_IGNORE_SEED`), so a freshly onboarded project is fine. A project whose owned
`.gitignore` lacks the entry fails on every launch, and the error does not name the cause.
The native-goldfish-host-state case NGHS17 fails with the same code and may have the same
cause.

## Triggering situation

An item-governed Claude or Codex Goldfish dispatch in a consumer whose `.gitignore` predates
the onboarding seed or was edited to drop `/evidence/`.

## Proposal

Either write the route record before the baseline capture, or treat the guard's own route
record as a known foreign path in the completion comparison. Also name the missing ignore
entry in the refusal. Check whether NGHS17 shares this cause.

## Acceptance

- An item-governed host commit succeeds in a consumer whose `.gitignore` lacks `/evidence/`,
  or is refused with a code that names the missing ignore entry.
- A pin covers that consumer shape.
