---
schema: pipeline.backlog-item.v1
id: pipeline.test-fixtures-inside-the-checkout-write-the-real-repository
type: defect
owner: pipeline
status: open
created: 2026-10-18
source: "WSL session 2026-10-18: second WSL Full Verify run with TMPDIR inside the checkout (scratch/test-tmp-verify2)."
sprint: alfred
done_when: manual
---

# Test fixtures inside the checkout write the real repository's state, private state and Git config

## Description

A Verify run with TMPDIR/TMP/TEMP pointed at a directory inside the checkout
(`scratch/test-tmp-verify2`) let fixtures that have no own `.git` resolve,
through ordinary Git discovery, to the enclosing real repository. The suites then
wrote real tracked and private state as "Fixture human answer":

- `project/pipeline-state.json`: plan approval revoked (`planApproved: false`),
  phase `design`, `planInvalidation.reason: enrollment-retirement`.
- `.git/agent-pipeline/onboarding/scopes/<scope>/`: a pending
  `enrollment-retirement.json`, its archive and a new `intake-checkpoint.json`;
  onboarding inspect turned `intake-required`.
- `.git/config`: the governance activation record for the repository scope was
  rewritten from active to `declined`; the preflight then reported
  `pipeline-governance-declined`.
- Untracked `pkey` at the root and `plugins/tmp/` (also seen with the default /tmp).
- First visible symptom: the UserPromptSubmit hook reported "an initial onboarding
  material turn was observed before consent" for a long-onboarded repository.

The same hazard exists on the documented path: `lib/test-tmpdir.mjs`
(`mkdtempTestScratch`) places fixtures under `scratch/test-tmp/` inside the
checkout, so any fixture created there without its own Git repository or a
`GIT_CEILING_DIRECTORIES` bound reaches the real repository.

## Acceptance

- No suite can write the enclosing repository: fixture roots are created outside
  the checkout, or every fixture Git call is bounded with
  `GIT_CEILING_DIRECTORIES` and fixtures without their own `.git` fail closed.
- The Verify runner gives child suites a private temp directory OUTSIDE the
  checkout (owner-only, no group/other-writable ancestor), so the POSIX authority
  ancestor check does not refuse `/tmp` fixtures and Windows `%TEMP%` grants do
  not leak.
- A tripwire suite fails when any suite changes tracked files, `.git/config`
  activation records or onboarding scope files of the real repository.
- The `/tmp` refusal `domain-ancestor-unsafe` surfaces a typed repair text.

## Recovery performed (2026-10-18)

- State restored from HEAD (mode 0600 restored); retirement journal, archive and
  intake checkpoint quarantined under `scratch/incident-quarantine-20261018/`;
  full private-state backup under `scratch/agent-pipeline-backup-20261018-incident/`;
  the fixture-created activation block removed from `.git/config` (the repository
  had no such block before; governance resolves as active from the tracked project
  files again, PO confirmed in chat); preflight ready, onboarding ready, calibration
  observer eligible. A fixture-created session-cleanup descriptor
  (`session-cleanup/active/session-384e92f0...`) is left in place for the orphan
  recovery route, which needs PO confirmation per archive.
