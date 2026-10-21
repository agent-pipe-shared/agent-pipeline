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

The same class shows up a second time (ALF-B2-AC259, 2026-10-19). The signed quality package
builds its isolated checkout under `<root>/scratch`, and `applyToMain` re-checks
`git status --porcelain` while that checkout still exists. In a repository that does not ignore
`scratch/`, the apply therefore always ends in `QUALITY-PACKAGE-BASE-DRIFT`. The Pipeline's own
working directories count as drift whenever the consumer does not ignore them.

## Triggering situation

An item-governed Claude or Codex Goldfish dispatch in a consumer whose `.gitignore` predates
the onboarding seed or was edited to drop `/evidence/`.

## Proposal

Either write the route record before the baseline capture, or treat the guard's own route
record as a known foreign path in the completion comparison. Also name the missing ignore
entry in the refusal. Check whether NGHS17 shares this cause.

## Coverage read 2026-10-21

Still reproducible in source: `lib/agy-host-commit-admission.mjs` counts every new untracked path as a child change, and the hook prints only the generic text. First half (the host commit) is addressed by the refusal route (new code `AGY-HOST-COMMIT-PIPELINE-PATH-UNIGNORED`, pins AHC07/AHC08, hook repair text); the comparison itself is deliberately not relaxed. Open: the quality-package apply half (`QUALITY-PACKAGE-BASE-DRIFT` on an unignored `scratch/`), whether NGHS17 shares the cause, and the PO choice between this refusal and treating the guard's own route record as a known foreign path.

## Acceptance

- An item-governed host commit succeeds in a consumer whose `.gitignore` lacks `/evidence/`,
  or is refused with a code that names the missing ignore entry.
- A pin covers that consumer shape.
- The quality-package apply either excludes its own isolated checkout from the clean-tree check
  or refuses with a code that names the missing `scratch/` ignore entry.
